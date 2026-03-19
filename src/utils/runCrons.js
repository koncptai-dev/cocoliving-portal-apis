require('dotenv').config();

const { runRentDetailsReport } = require('./rentDetailsCron');
const { OrderStatusCron, RefundStatusCron } = require('./phonepe/phonepeCron');

async function runAll() {
  await runRentDetailsReport();

  const orderId = process.env.PHONEPE_ORDER_ID;
  const refundId = process.env.PHONEPE_REFUND_ID;

  if (orderId) {
    OrderStatusCron(orderId);
  } else {
    console.log('PHONEPE_ORDER_ID not set. Skipping OrderStatusCron.');
  }

  if (refundId) {
    RefundStatusCron(refundId);
  } else {
    console.log('PHONEPE_REFUND_ID not set. Skipping RefundStatusCron.');
  }
}

runAll().catch((err) => {
  console.error('Failed running cron jobs:', err);
  process.exit(1);
});
