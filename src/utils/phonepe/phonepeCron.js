const cron = require("node-cron");
const Status = require("./phonepeApi")

const activeJobs = new Map(); 

async function OrderStatusCron(orderId) {
    if (activeJobs.has(orderId)) {
        console.log("Order Cron already running for:", orderId);
        return;
      }

    const job = cron.schedule("* * * * *", async () => {
      console.log("Checking order status for:", orderId);
  
      const {body} = await Status.getOrderStatus(orderId);
  
      console.log("Current Order Status:", body.state);
  
      if (body.state === "COMPLETED" || body.state === "FAILED") {
        console.log("Order final status reached. Stopping cron:", orderId);
        job.stop();
        job.destroy();
        activeJobs.delete(orderId);
      }
    });
  
    activeJobs.set(orderId, job);
  }

  async function RefundStatusCron(refundId) {
    if (activeJobs.has(refundId)) {
        console.log("Refund Cron already running for:", refundId);
        return;
      }

    const job = cron.schedule("* * * * *", async () => {
      console.log("Checking refund status:", refundId);
  
      const {body} = await Status.getRefundStatus(refundId);

      console.log("Current Refund Status:", body.state);
  
      if (body.state === "COMPLETED" || body.state === "FAILED") {
        console.log("Refund final status reached. Stopping cron:", refundId);
        job.stop();
        job.destroy();
        activeJobs.delete(refundId);
      }
    });
  
    activeJobs.set(refundId, job);
  }

  module.exports = {
    OrderStatusCron,
    RefundStatusCron,
  };