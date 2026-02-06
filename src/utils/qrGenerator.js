const QRCode = require('qrcode');

exports.generateQrBuffer = async (qrToken) => {
  return QRCode.toBuffer(qrToken, {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 300,
  });
};
