const FAST_CRON = process.env.ALISTE_CRON_EVERY_MINUTE === 'true';

const getCronSchedule = normalSchedule => {
  if (FAST_CRON) {
    return '* * * * *';
  }

  return normalSchedule;
};

module.exports = {
  getCronSchedule,
};