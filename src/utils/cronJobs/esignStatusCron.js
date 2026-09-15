const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { Contract, Booking } = require("../../models");
const idtoEsignService = require("../idtoEsignService");
const { mailsender } = require("../emailService");
const { idtoEsignAlertEmail } = require("../emailTemplates/emailTemplates");

let isCronRunning = false;

/**
 * Sends failure alert emails to IDTO team only once per contract
 */
async function sendFailureAlertEmails(contract, docketId, documentId, signingStatus) {
  try {
    if (contract.emailAlertSent) {
      console.info("[esignStatusCron] Alert email already sent for this contract, skipping", {
        contractId: contract.id,
        bookingId: contract.bookingId,
      });
      return;
    }
    const alertRecipients = (process.env.ESIGN_ALERT_EMAIL || "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

    if (!alertRecipients.length) {
      console.warn(
        "[esignStatusCron] ESIGN_ALERT_EMAIL is not configured. Skipping alert email."
      );
      return;
    }
    let userName = 'N/A';
    let userEmail = 'N/A';
    let userPhone = 'N/A';
    let propertyName = 'N/A';
    let roomNumber = 'N/A';

    try {
      const booking = await Booking.findByPk(contract.bookingId, {
        include: [
          { model: require("../../models").User, as: "user" },
          {
            model: require("../../models").Rooms,
            as: "room",
            include: [{ model: require("../../models").Property, as: "property" }]
          }
        ]
      });

      if (booking) {
        userName = booking.user?.fullName || 'N/A';
        userEmail = booking.user?.email || 'N/A';
        userPhone = booking.user?.phone || 'N/A';
        propertyName = booking.room?.property?.name || 'N/A';
        roomNumber = booking.room?.roomNumber || 'N/A';
      }
    } catch (fetchErr) {
      console.error("[esignStatusCron] Failed to fetch booking details for email:", fetchErr.message);
    }

    const template = idtoEsignAlertEmail({
      contractId: contract.id,
      bookingId: contract.bookingId,
      docketId,
      documentId,
      signingStatus,
      fetchAttemptCount: contract.fetchAttemptCount,
      userName,
      userEmail,
      userPhone,
      propertyName,
      roomNumber
    });

    await mailsender(
      alertRecipients.join(","),
      "eSign Document Status Alert - Coco Living",
      template.html,
      template.attachments
    );
    contract.emailAlertSent = true;
    await contract.save().catch((err) => {
      console.error("[esignStatusCron] Failed to update emailAlertSent flag:", err.message);
    });

    console.info("[esignStatusCron] Failure alert email sent (first time)", {
      contractId: contract.id,
      bookingId: contract.bookingId,
      userName,
      fetchAttemptCount: contract.fetchAttemptCount,
      recipients: alertRecipients,
    });
  } catch (emailErr) {
    console.error("[esignStatusCron] Failed to send failure alert emails:", emailErr.message);
  }
}

/**
 * Checks and updates eSign document statuses for all in-progress contracts
 */
async function checkEsignStatus() {
  if (isCronRunning) {
    console.info("[esignStatusCron] Previous execution still running, skipping this tick.");
    return;
  }
  isCronRunning = true;
  console.info("\n🕒 [esignStatusCron] Starting eSign status check...");

  try {
    const inProgressContracts = await Contract.findAll({
      where: {
        esignStatus: "IN_PROGRESS",
      },
    });

    console.info(
      `[esignStatusCron] Found ${inProgressContracts.length} contract(s) in progress.`
    );

    for (const contract of inProgressContracts) {
      try {
        const docketId = contract.esignDocketId;
        const documentId = contract.esignDocumentId;

        if (!docketId || !documentId) {
          console.warn(
            "[esignStatusCron] Cannot fetch signed document without docket_id or document_id",
            {
              contractId: contract.id,
              bookingId: contract.bookingId,
              docketId,
              documentId,
            }
          );
          continue;
        }

        let documentResponse;
        try {
          documentResponse = await Promise.race([
            idtoEsignService.fetchEsignDocument({
              docket_id: docketId,
              document_id: documentId,
            }),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("API call timeout after 180 seconds")),
                180000
              )
            ),
          ]);
        } catch (timeoutErr) {
          contract.esignRawResponse = {
            ...(contract.esignRawResponse || {}),
            lastDocumentFetchError: {
              message: timeoutErr.message,
              status: "timeout",
              timestamp: new Date(),
            },
          };
          await contract.save().catch((err) => {
            console.error("[esignStatusCron] Failed to save timeout error:", err.message);
          });

          console.error("[esignStatusCron] API call timed out", {
            contractId: contract.id,
            docketId,
            documentId,
            error: timeoutErr.message,
          });
          continue;
        }

        const signedPdfContent = documentResponse?.content;
        const signingStatus = documentResponse?.signing_status;

        contract.esignRawResponse = {
          ...(contract.esignRawResponse || {}),
          lastDocumentFetch: {
            status: documentResponse?.status,
            signing_status: signingStatus,
            document_id: documentResponse?.document_id,
            content_type: documentResponse?.content_type,
            content_length:
              typeof signedPdfContent === "string" ? signedPdfContent.length : 0,
          },
        };

        if (
          signingStatus !== "signed" ||
          typeof signedPdfContent !== "string"
        ) {
          contract.fetchAttemptCount = (contract.fetchAttemptCount || 0) + 1;
          console.info("[esignStatusCron] Signed PDF is not ready yet", {
            contractId: contract.id,
            docketId,
            documentId,
            signingStatus: signingStatus || "pending",
            contentLength:
              typeof signedPdfContent === "string" ? signedPdfContent.length : 0,
            fetchAttemptCount: contract.fetchAttemptCount,
          });

          await contract.save().catch((err) => {
            console.error("[esignStatusCron] Failed to save fetchAttemptCount:", err.message);
          });

          if (contract.fetchAttemptCount === 5) {
            await sendFailureAlertEmails(
              contract,
              docketId,
              documentId,
              signingStatus || "pending"
            );
          }

          continue;
        }
        const finalPath = path.join(
          __dirname,
          `../../uploads/contracts/contract-${contract.bookingId}.pdf`
        );
        const dir = path.dirname(finalPath);

        try {
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(finalPath, Buffer.from(signedPdfContent, "base64"));

          contract.esignStatus = "COMPLETED";
          contract.signedAt = new Date();
          contract.signedPdfPath = finalPath;

          console.info("[esignStatusCron] Signed PDF saved", {
            contractId: contract.id,
            bookingId: contract.bookingId,
            docketId,
            documentId: documentResponse?.document_id || documentId,
            filePath: finalPath,
            fileSizeBytes: fs.statSync(finalPath).size,
          });

          await contract.save().catch((err) => {
            console.error("[esignStatusCron] Failed to save contract with signed PDF path:", err.message);
          });
          const booking = await Booking.findByPk(contract.bookingId);
          if (booking) {
            booking.contractStatus = "SIGNED";
            booking.adminContractStatus = "NOT_SIGNED";
            await booking.save().catch((err) => {
              console.error("[esignStatusCron] Failed to update booking status:", err.message);
            });
          } else {
            console.warn("[esignStatusCron] Booking not found", {
              contractId: contract.id,
              bookingId: contract.bookingId,
            });
          }
        } catch (fileErr) {
          console.error("[esignStatusCron] Error saving PDF file:", fileErr.message, {
            contractId: contract.id,
            finalPath,
            error: fileErr,
          });

          contract.esignRawResponse = {
            ...(contract.esignRawResponse || {}),
            lastDocumentFetchError: {
              message: fileErr.message,
              status: "file_write_error",
              timestamp: new Date(),
            },
          };
          await contract.save().catch((err) => {
            console.error("[esignStatusCron] Failed to save file error:", err.message);
          });
        }
      } catch (err) {
        contract.esignRawResponse = {
          ...(contract.esignRawResponse || {}),
          lastDocumentFetchError: {
            message: err.message,
            status: err.status,
            timestamp: new Date(),
          },
        };
        await contract.save().catch((saveErr) => {
          console.error("[esignStatusCron] Failed to save error details:", saveErr.message);
        });

        console.error("[esignStatusCron] Error processing contract", {
          contractId: contract.id,
          bookingId: contract.bookingId,
          error: err.message,
        });
      }
    }
  } catch (err) {
    console.error("[esignStatusCron] Fatal error in cron execution:", err.message);
  } finally {
    isCronRunning = false;
  }
}

cron.schedule("*/5 * * * *", checkEsignStatus, {
  timezone: "Asia/Kolkata",
});

module.exports = { checkEsignStatus, sendFailureAlertEmails };