const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { Contract, Booking } = require("../../models");
const idtoEsignService = require("../idtoEsignService");
const { mailsender } = require("../emailService");
const {
  idtoEsignAlertEmail,
  devEsignAlertEmail,
} = require("../emailTemplates/emailTemplates");

let isCronRunning = false;

/**
 * Sends failure alert emails to IDTO and Dev teams on every 5 consecutive fails
 */
async function sendFailureAlertEmails(contract, docketId, documentId, signingStatus) {
  try {
    const idtoTemplate = idtoEsignAlertEmail({
      contractId: contract.id,
      bookingId: contract.bookingId,
      docketId,
      documentId,
      signingStatus,
      fetchAttemptCount: contract.fetchAttemptCount,
    });

    const devTemplate = devEsignAlertEmail({
      contractId: contract.id,
      bookingId: contract.bookingId,
      docketId,
      documentId,
      signingStatus,
      fetchAttemptCount: contract.fetchAttemptCount,
    });

    await Promise.allSettled([
      mailsender(
        "info@idto.ai",
        "eSign Document Status Alert - IDTO",
        idtoTemplate.html,
        idtoTemplate.attachments
      ),
      mailsender(
        "dev@cocoliving.in",
        "eSign Document Status Alert - Coco Living",
        devTemplate.html,
        devTemplate.attachments
      ),
    ]);

    console.info("esignCron: consecutive failure alert emails sent", {
      contractId: contract.id,
      bookingId: contract.bookingId,
      fetchAttemptCount: contract.fetchAttemptCount,
      recipients: ["info@idto.ai", "dev@cocoliving.in"],
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

        const documentResponse = await idtoEsignService.fetchEsignDocument({
          docket_id: docketId,
          document_id: documentId,
        });

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
          console.info("esignCron: signed PDF is not ready yet", {
            contractId: contract.id,
            docketId,
            documentId,
            signingStatus: signingStatus || "pending",
            contentLength:
              typeof signedPdfContent === "string" ? signedPdfContent.length : 0,
            fetchAttemptCount: contract.fetchAttemptCount,
          });

          await contract.save();

          if (contract.fetchAttemptCount % 5 === 0) {
            await sendFailureAlertEmails(
              contract,
              docketId,
              documentId,
              signingStatus || "pending"
            );
          }

          continue;
        }

        contract.esignStatus = "COMPLETED";
        contract.signedAt = new Date();

        const finalPath = path.join(
          __dirname,
          `../../uploads/contracts/contract-${contract.bookingId}.pdf`
        );
        const dir = path.dirname(finalPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(finalPath, Buffer.from(signedPdfContent, "base64"));
        contract.signedPdfPath = finalPath;

        console.info("esignCron: signed PDF saved", {
          contractId: contract.id,
          bookingId: contract.bookingId,
          docketId,
          documentId: documentResponse?.document_id || documentId,
          filePath: finalPath,
          fileSizeBytes: fs.statSync(finalPath).size,
        });

        await contract.save();

        const booking = await Booking.findByPk(contract.bookingId);
        if (booking) {
          booking.contractStatus = "SIGNED";
          booking.adminContractStatus = "NOT_SIGNED";
          await booking.save();
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
        await contract.save().catch(() => {});

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
