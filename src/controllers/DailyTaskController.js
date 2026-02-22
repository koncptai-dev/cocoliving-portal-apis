const { DailyCleaning, DailyCleaningTask, Rooms, User } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

exports.submitDailyCleaning = async (req, res) => {
  try {
    let { roomId, roomNumber, tasks } = req.body;
    const cleanerId = req.user.id;

    // Resolve roomId from roomNumber if roomId not provided
    if (!roomId && roomNumber) {
      const room = await Rooms.findOne({ where: { roomNumber } });
      if (!room) return res.status(400).json({ success: false, message: `Room number ${roomNumber} does not exist` });
      roomId = room.id;
    }

    if (!roomId) return res.status(400).json({ success: false, message: 'roomId or roomNumber is required' });

    // Parse tasks if string
    if (typeof tasks === "string") tasks = JSON.parse(tasks);
    if (!Array.isArray(tasks) || tasks.length === 0)
      return res.status(400).json({ message: "Tasks required" });

    const cleaningDate = new Date().toISOString().slice(0, 10);

    // Get or create DailyCleaning record
    let cleaning = await DailyCleaning.findOne({ where: { roomId, cleaningDate } });
    if (cleaning) {
      return res.status(400).json({
        message: "Cleaning already submitted for today"
      });
    }

    // Handle photos
    const photosFiles = req.files?.photos || [];

    const photos = photosFiles.map(f => `/uploads/dailyCleaning/${f.filename}`);

    if (photos.length > 10)
    { return res.status(400).json({  message: "Maximum 10 images allowed" });}


    cleaning = await DailyCleaning.create({
      roomId,
      cleanerId,
      cleaningDate,
      status: "Completed",
      submittedAt: new Date(),
      photos,
    });


    // Upsert tasks
    for (const t of tasks) {
      if (!t.taskName || !t.taskName.trim()) continue;

      await DailyCleaningTask.create({
        dailyCleaningId: cleaning.id,
        taskName: t.taskName.trim(),
        isCompleted: !!t.isCompleted
      });
    }

    res.json({
      success: true,
      message: "Daily cleaning submitted successfully",
      cleaningId: cleaning.id
    });

  } catch (error) {
    console.error('SubmitDailyCleaning Error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit daily cleaning', error: error.message });
  }
};

exports.getDailyCleaning = async (req, res) => {
  try {
    const cleanerId = req.user.id;
    const { roomId, date } = req.query;

    const whereClause = { cleanerId };

    if (roomId) whereClause.roomId = roomId;
    if (date) whereClause.cleaningDate = date;

    const cleanings = await DailyCleaning.findAll({
      where: whereClause,
      include: [
        { model: DailyCleaningTask, as: 'tasks' },
        { model: Rooms, as: 'room', attributes: ['id', 'roomNumber'] },
        { model: User, as: 'cleaner', attributes: ['id', 'fullName'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: cleanings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

