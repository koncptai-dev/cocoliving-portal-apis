module.exports = (req, res, next) => {
  console.log(
    '\n========== ALISTE WEBHOOK AUTH =========='
  );

  console.log(
    'HEADERS:',
    JSON.stringify(req.headers, null, 2)
  );

  const incomingAuth =
    req.headers.authorization;

  console.log(
    'INCOMING AUTH:',
    incomingAuth
  );

  console.log(
    'ENV AUTH:',
    process.env.ALISTE_WEBHOOK_SECRET
  );

  if (!incomingAuth) {
    console.log(
      '❌ Missing authorization header'
    );

    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (
    incomingAuth.trim() !==
    process.env.ALISTE_WEBHOOK_SECRET.trim()
  ) {
    console.log(
      '❌ Authorization mismatch'
    );

    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  console.log('✅ Webhook authorized');

  next();
};