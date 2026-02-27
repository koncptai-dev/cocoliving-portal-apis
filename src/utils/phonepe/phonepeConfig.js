require('dotenv').config();

const ENV = process.env.PHONEPE_ENV === 'prod' ? 'prod' : 'sandbox';

// Base URLs 
const BASE_URL =
  ENV === 'prod'
    ? 'https://api.phonepe.com/apis/pg'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

module.exports = {
  // Create Payment ( WEB )
  CREATE_PAYMENT_URL: `${BASE_URL}/checkout/v2/pay`,

  // Create Order ( MOBILE APP )
  MOBILE_SDK_ORDER_URL: `${BASE_URL}/checkout/v2/sdk/order`,

  //  Order Status
  ORDER_STATUS_URL_TEMPLATE: `${BASE_URL}/checkout/v2/order/{merchantOrderId}/status`,

  //  Refund Status
  REFUND_STATUS_URL_TEMPLATE: `${BASE_URL}/payments/v2/refund/{merchantRefundId}/status`,

  // Refund
  REFUND_URL:
    ENV === 'prod'
      ? 'https://api.phonepe.com/apis/pg/payments/v2/refund'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox/payments/v2/refund',

  // Auth token
  AUTH_TOKEN_URL:
    ENV === 'prod'
      ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',

  // Client credentials
  CLIENT_ID: process.env.PHONEPE_CLIENT_ID,
  CLIENT_SECRET: process.env.PHONEPE_CLIENT_SECRET,
  CLIENT_VERSION: process.env.PHONEPE_CLIENT_VERSION,

  // Where PhonePe will redirect user after payment
  REDIRECT_URL: process.env.PHONEPE_REDIRECT_URL,

  // Webhook username/password (for SHA256(username:password) verification)
  WEBHOOK_USERNAME: process.env.PHONEPE_WEBHOOK_USERNAME,
  WEBHOOK_PASSWORD: process.env.PHONEPE_WEBHOOK_PASSWORD,
};