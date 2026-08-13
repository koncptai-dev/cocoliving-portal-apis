const path = require("path");
const { Op } = require("sequelize");

const sequelize = require("../config/database");

const {
  Booking,
  PaymentTransaction,
  User,
} = require("../models");

const { logApiCall } = require("../helpers/auditLog");
const { sendEmail } = require("../utils/sendEmail");
const {
  accountantInvoiceEmail,
} = require("../utils/emailTemplates/emailTemplates");

const buildErrorPayload = (
  err,
  fallbackMessage = "Internal server error"
) => ({
  success: false,
  message: err?.message || fallbackMessage,
  error: err?.name || "Error",
  details: err?.errors || null,
});

exports.decideAccounting = async (req, res) => {
  const transaction = await sequelize.transaction();
  let committed = false;

  try {
    const { bookingId } = req.params;

    if (!bookingId || !Number.isInteger(Number(bookingId))) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: "Valid bookingId is required",
      });
    }

    const rawApproved = req.body?.approved;

    let approved;

    if (
      rawApproved === true ||
      rawApproved === "true"
    ) {
      approved = true;
    } else if (
      rawApproved === false ||
      rawApproved === "false"
    ) {
      approved = false;
    } else {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: "approved must be a boolean",
      });
    }

    const rejectionReason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : "";

    const booking = await Booking.findByPk(Number(bookingId), {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!booking) {
      await transaction.rollback();

      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (booking.accountingStatus !== "PENDING") {
      await transaction.rollback();

      return res.status(409).json({
        success: false,
        message: `Booking is not pending accountant review. Current accounting status: ${booking.accountingStatus}`,
        accountingStatus: booking.accountingStatus,
      });
    }

    const initialPayments = await PaymentTransaction.findAll({
      where: {
        bookingId: booking.id,
        type: "INITIAL",
        status: "SUCCESS",
      },
      order: [["createdAt", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (initialPayments.length === 0) {
      await transaction.rollback();

      return res.status(409).json({
        success: false,
        message: "No successful initial payment was found for this booking",
      });
    }

    if (initialPayments.length > 1) {
      await transaction.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Multiple successful initial payments were found for this booking. Accountant review cannot continue until the payment data is corrected.",
      });
    }

    const initialPayment = initialPayments[0];

    if (approved) {
      if (!req.file) {
        await transaction.rollback();

        return res.status(400).json({
          success: false,
          message: "Invoice file is required when approving a payment",
        });
      }


      const accountantInvoicePdfPath =
        `/uploads/accountantInvoices/${req.file.filename}`;

      initialPayment.accountantInvoicePdfPath =
        accountantInvoicePdfPath;

      await initialPayment.save({
        transaction,
      });

      booking.accountingStatus = "APPROVED";
      booking.accountingRejectionReason = null;

      await booking.save({
        transaction,
      });

      await transaction.commit();
      committed = true;

      try {
        const resident = await User.findByPk(booking.userId, {
          attributes: ["id", "fullName", "email"],
        });

        if (resident?.email) {
          const emailTemplate = accountantInvoiceEmail({
            userName: resident.fullName,
            bookingId: booking.id,
            amount: Number(initialPayment.amount || 0) / 100,
            paymentDate:
              initialPayment.paymentDate ||
              initialPayment.createdAt,
          });

          await sendEmail({
            to: resident.email,
            subject: `Invoice for Booking #${booking.id}`,
            html: emailTemplate.html,
            attachments: [
              ...(emailTemplate.attachments || []),
              {
                filename:
                  req.file.originalname ||
                  `accountant-invoice-${booking.id}${path.extname(
                    req.file.filename
                  )}`,
                path: req.file.path,
              },
            ],
          });
        } else {
          console.warn(
            `[AccountsManagement] Resident email unavailable for booking ${booking.id}`
          );
        }
      } catch (emailError) {
        console.error(
          `[AccountsManagement] Failed to send accountant invoice email for booking ${booking.id}:`,
          emailError
        );
      }

      await logApiCall(
        req,
        res,
        200,
        `Accountant approved booking payment and uploaded invoice (Booking ID: ${booking.id})`,
        "Accounts Management",
        booking.id
      );

      return res.status(200).json({
        success: true,
        message:
          "Payment approved and accountant invoice uploaded successfully",
        booking: {
          id: booking.id,
          accountingStatus: booking.accountingStatus,
          accountingRejectionReason:
            booking.accountingRejectionReason,
        },
        payment: {
          id: initialPayment.id,
          type: initialPayment.type,
          status: initialPayment.status,
          accountantInvoicePdfPath:
            initialPayment.accountantInvoicePdfPath,
        },
      });
    }

    if (!rejectionReason) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: "Rejection reason is required when rejecting a payment",
      });
    }

    if (rejectionReason.length > 2000) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: "Rejection reason must not exceed 2000 characters",
      });
    }

    booking.accountingStatus = "REJECTED";
    booking.accountingRejectionReason = rejectionReason;

    await booking.save({
      transaction,
    });

    await transaction.commit();
    committed = true;
    if (booking.createdByAdminId) {
      try {
        const bookingCreator = await User.findByPk(
          booking.createdByAdminId,
          {
            attributes: ["id", "fullName", "email", "role"],
          }
        );

        if (bookingCreator?.email) {
          await sendEmail({
            to: bookingCreator.email,
            subject: `Booking #${booking.id} Requires Correction`,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8" />
              </head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Booking Requires Correction</h2>

                <p>
                  Hello ${bookingCreator.fullName || "Admin"},
                </p>

                <p>
                  The accountant has reviewed Booking
                  <strong>#${booking.id}</strong> and rejected the
                  payment for the following reason:
                </p>

                <div style="
                  background:#f5f5f5;
                  border-left:4px solid #D36517;
                  padding:12px 16px;
                  margin:16px 0;
                ">
                  ${rejectionReason}
                </div>

                <p>
                  Please review and correct the booking details.
                  Once corrected, submit the booking for accountant
                  approval again.
                </p>
              </body>
              </html>
            `,
          });
        } else {
          console.warn(
            `[AccountsManagement] No email found for booking creator ${booking.createdByAdminId} on booking ${booking.id}`
          );
        }
      } catch (emailError) {
        console.error(
          `[AccountsManagement] Failed to send accountant rejection email for booking ${booking.id}:`,
          emailError
        );
      }
    }

    await logApiCall(
      req,
      res,
      200,
      `Accountant rejected booking payment (Booking ID: ${booking.id})`,
      "Accounts Management",
      booking.id
    );

    return res.status(200).json({
      success: true,
      message: "Payment rejected and booking returned for correction",
      booking: {
        id: booking.id,
        accountingStatus: booking.accountingStatus,
        accountingRejectionReason:
          booking.accountingRejectionReason,
      },
    });
  } catch (err) {
    if (!committed) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error(
          "[AccountsManagement] Transaction rollback failed:",
          rollbackError
        );
      }
    }

    console.error(
      "[AccountsManagement] decideAccounting error:",
      err
    );

    await logApiCall(
      req,
      res,
      500,
      "Error occurred while processing accountant decision",
      "Accounts Management",
      Number(req.params.bookingId) || 0
    );

    return res
      .status(500)
      .json(buildErrorPayload(err));
  }
};