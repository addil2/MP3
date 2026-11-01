var Task = require('../models/task');
var mongoose = require('mongoose');
var User = require('../models/user');

module.exports = function (router) {


    router.get('/tasks', async function (req, res) {
        try {
            var tasks = await Task.find().limit(100);

            res.status(200).json({
                message: 'Tasks retrieved successfully',
                data: tasks
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                message: 'Unable to retrieve tasks',
                data: null
            });
        }
    });

    router.post('/tasks', async function (req, res) {
        try {
            var name = req.body.name;
            var deadline = req.body.deadline;
            var description = req.body.description;
            var completed = req.body.completed;
            var assignedUser = req.body.assignedUser;

            if (typeof name !== 'string' || !name.trim() ||
                typeof deadline !== 'string' ||
                !deadline.trim() ||
                Number.isNaN(Date.parse(deadline))) {
                return res.status(400).json({
                    message: 'A valid name and deadline are required',
                    data: null
                });
            }

            if (description !== undefined &&
                typeof description !== 'string') {
                return res.status(400).json({
                    message: 'Description must be a string',
                    data: null
                });
            }

            if (completed !== undefined &&
                typeof completed !== 'boolean') {
                return res.status(400).json({
                    message: 'Completed must be a boolean',
                    data: null
                });
            }

            if (assignedUser !== undefined &&
                typeof assignedUser !== 'string') {
                return res.status(400).json({
                    message: 'Assigned user must be a string',
                    data: null
                });
            }

            var user = null;

            if (assignedUser) {
                if (!mongoose.isObjectIdOrHexString(assignedUser)) {
                    return res.status(404).json({
                        message: 'Assigned user not found',
                        data: null
                    });
                }

                user = await User.findById(assignedUser);

                if (!user) {
                    return res.status(404).json({
                        message: 'Assigned user not found',
                        data: null
                    });
                }
            }

            var task = new Task({
                name: name,
                deadline: deadline,
                description: description === undefined ? '' : description,
                completed: completed === undefined ? false : completed,
                assignedUser: user ? user._id.toString() : '',
                assignedUserName: user ? user.name : 'unassigned'
            });

            await task.save();

            if (user && !task.completed) {
                await User.findByIdAndUpdate(user._id, {
                    $addToSet: {
                        pendingTasks: task._id.toString()
                    }
                });
            }

            return res.status(201).json({
                message: 'Task created successfully',
                data: task
            });

        } catch (err) {
            console.error(err);

            return res.status(500).json({
                message: 'Unable to create task',
                data: null
            });
        }
    });

    router.get('/tasks/:id', async function (req, res) {
        try {
            var id = req.params.id;

            if (!mongoose.isObjectIdOrHexString(id)) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            var select = {};

            if (req.query.select !== undefined) {
                try {
                    select = JSON.parse(req.query.select);

                    if (select === null || typeof select !== 'object' ||
                        Array.isArray(select)
                    ) {
                        return res.status(400).json({
                            message: 'Invalid select parameter',
                            data: null
                        });
                    }
                } catch (err) {
                    return res.status(400).json({
                        message: 'Invalid select parameter',
                        data: null
                    });
                }
            }

            var task = await Task.findById(id).select(select);

            if (!task) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            res.status(200).json({
                message: 'Task retrieved successfully',
                data: task
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                message: 'Unable to retrieve task',
                data: null
            });
        }
    });

    router.delete('/tasks/:id', async function (req, res) {
        try {
            var id = req.params.id;

            if (!mongoose.isObjectIdOrHexString(id)) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            var task = await Task.findById(id);

            if (!task) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            await User.updateMany(
                { pendingTasks: id },
                { $pull: { pendingTasks: id } }
            );

            await Task.findByIdAndDelete(id);

            return res.status(204).send();
        } catch (err) {
            console.error(err);

            return res.status(500).json({
                message: 'Unable to delete task',
                data: null
            });
        }
    });

    router.put('/tasks/:id', async function (req, res) {
        try {
            var id = req.params.id;

            if (!mongoose.isObjectIdOrHexString(id)) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            var task = await Task.findById(id);

            if (!task) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            var name = req.body.name;
            var deadline = req.body.deadline;

            if (typeof name !== 'string' || !name.trim() ||
                typeof deadline !== 'string' || !deadline.trim() ||
                Number.isNaN(Date.parse(deadline))) {
                return res.status(400).json({
                    message: 'A valid name and deadline are required',
                    data: null
                });
            }

            var description = req.body.description === undefined
                ? '' : req.body.description;
            var completed = req.body.completed === undefined
                ? false : req.body.completed;
            var assignedUser = req.body.assignedUser === undefined
                ? '' : req.body.assignedUser;

            if (typeof description !== 'string' ||
                typeof completed !== 'boolean' ||
                typeof assignedUser !== 'string') {
                return res.status(400).json({
                    message: 'Invalid task fields',
                    data: null
                });
            }

            var newUser = null;

            if (assignedUser) {
                if (!mongoose.isObjectIdOrHexString(assignedUser)) {
                    return res.status(404).json({
                        message: 'Assigned user not found',
                        data: null
                    });
                }

                newUser = await User.findById(assignedUser);

                if (!newUser) {
                    return res.status(404).json({
                        message: 'Assigned user not found',
                        data: null
                    });
                }
            }

            if (task.assignedUser) {
                await User.findByIdAndUpdate(task.assignedUser, {
                    $pull: { pendingTasks: task._id.toString() }
                });
            }

            task.name = name;
            task.deadline = deadline;
            task.description = description;
            task.completed = completed;
            task.assignedUser = newUser ? newUser._id.toString() : '';
            task.assignedUserName = newUser ? newUser.name : 'unassigned';

            await task.save();

            if (newUser && !task.completed) {
                await User.findByIdAndUpdate(newUser._id, {
                    $addToSet: { pendingTasks: task._id.toString() }
                });
            }

            return res.status(200).json({
                message: 'Task updated successfully',
                data: task
            });

        } catch (err) {
            console.error(err);

            return res.status(500).json({
                message: 'Unable to update task',
                data: null
            });
        }
    });

    return router;
};