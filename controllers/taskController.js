const StudentTask = require("../models/StudentTask");
const User = require("../models/User");
const Notification = require("../models/Notification");

// Mentor assigns a task to a student
exports.assignTask = async (req, res) => {
    try {
        const mentorId = req.user.id;
        const { studentId, title, description } = req.body;

        if (!studentId) {
            return res.status(400).json({ message: "Student ID is required." });
        }
        if (!title || !title.trim()) {
            return res.status(400).json({ message: "Task title cannot be empty." });
        }

        const student = await User.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        const newTask = new StudentTask({
            student: studentId,
            mentor: mentorId,
            mentorName: req.user.name,
            title: title.trim(),
            description: (description || "").trim(),
            status: "pending"
        });

        await newTask.save();

        // Send system notification to the student
        try {
            const notif = new Notification({
                recipient: studentId,
                title: "New Task Assigned",
                message: `Mentor ${req.user.name} assigned you a task: "${title.trim()}"`,
                link: "/focusrooms",
                isRead: false
            });
            await notif.save();
        } catch (notifErr) {
            console.error("Failed to generate task notification:", notifErr);
        }

        res.status(201).json(newTask);
    } catch (error) {
        console.error("assignTask error:", error);
        res.status(500).json({ message: "Failed to assign task.", error: error.message });
    }
};

// Get tasks
exports.getTasks = async (req, res) => {
    try {
        const userId = req.user.id;
        const { studentId } = req.query;

        let query = {};
        if (req.user.role === 'teacher') {
            // Mentor queries tasks they assigned
            query.mentor = userId;
            if (studentId) {
                query.student = studentId;
            }
        } else {
            // Student queries tasks assigned to them
            query.student = userId;
        }

        const tasks = await StudentTask.find(query).sort({ createdAt: -1 });
        res.status(200).json(tasks);
    } catch (error) {
        console.error("getTasks error:", error);
        res.status(500).json({ message: "Failed to retrieve tasks.", error: error.message });
    }
};

// Toggle student task status (completed/pending)
exports.toggleTaskStatus = async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await StudentTask.findById(taskId);

        if (!task) {
            return res.status(404).json({ message: "Task not found." });
        }

        // Only the assigned student or mentor can toggle
        if (task.student.toString() !== req.user.id && task.mentor.toString() !== req.user.id) {
            return res.status(403).json({ message: "Access denied." });
        }

        task.status = task.status === "completed" ? "pending" : "completed";
        await task.save();

        res.status(200).json(task);
    } catch (error) {
        console.error("toggleTaskStatus error:", error);
        res.status(500).json({ message: "Failed to update task.", error: error.message });
    }
};

// Delete student task (mentor only)
exports.deleteTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await StudentTask.findById(taskId);

        if (!task) {
            return res.status(404).json({ message: "Task not found." });
        }

        // Either the mentor who assigned it or the student it was assigned to can delete it
        if (task.mentor.toString() !== req.user.id && task.student.toString() !== req.user.id) {
            return res.status(403).json({ message: "Access denied. You are not authorized to remove this task." });
        }

        await StudentTask.findByIdAndDelete(taskId);
        res.status(200).json({ message: "Task deleted successfully." });
    } catch (error) {
        console.error("deleteTask error:", error);
        res.status(500).json({ message: "Failed to delete task.", error: error.message });
    }
};
