
var User = require('../models/user');
var Task = require('../models/task');
var mongoose = require('mongoose');

module.exports = function (router) {

    router.get('/users', async function (req, res) {
        try {
            var users = await User.find();

            res.status(200).json({
                message: 'Users retrieved successfully',
                data: users
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                message: 'Unable to retrieve users',
                data: null
            });
        }
    });

    router.post('/users', async function(req, res) {
        try {
            var name = req.body.name;
            var email = req.body.email;

            if (typeof name !== 'string' ||
                !name.trim() ||
                typeof email !== 'string' ||
                !email.trim()) {

                    return res.status(400).json({
                        message: 'Name and email are required',
                        data: null
                    });

                }

                var user = new User({
                    name: name,
                    email: email
                });

                await user.save();

                res.status(201).json({
                    message: 'User created successfully',
                    data: user
                });
        } catch (err) {
            console.error(err);

            if (err.code === 11000) {
                return res.status(400).json({
                    message: 'A user with this email already exists',
                    data: null
                });
            }

            res.status(500).json({
                message: 'Unable to create user',
                data: null
            });
        }
    });

    router.get('/users/:id', async function (req, res) {
        try {
            var id = req.params.id;

            if (!mongoose.isObjectIdOrHexString(id)) {
                return res.status(404).json({
                    message: 'User not found',
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

            var user = await User.findById(id).select(select);

            if (!user) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            res.status(200).json({
                message: 'User retrieved successfully',
                data: user
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                message: 'Unable to retrieve user',
                data: null
            });
        }
    });

    router.delete('/users/:id', async function (req, res) {
        try {
            var id = req.params.id;

            if (!mongoose.isObjectIdOrHexString(id)) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            var user = await User.findById(id);

            if (!user) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            await Task.updateMany(
                { assignedUser: id },
                {
                    $set: {
                        assignedUser: '',
                        assignedUserName: 'unassigned'
                    }
                }
            );

            await User.findByIdAndDelete(id);

            return res.status(204).send();
        } catch (err) {
            console.error(err);

            return res.status(500).json({
                message: 'Unable to delete user',
                data: null
            });
        }
    });

    router.put('/users/:id', async function (req, res) {
        try {
            var id = req.params.id;

            if (!mongoose.isObjectIdOrHexString(id)) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            var user = await User.findById(id);

            if (!user) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            var name = req.body.name;
            var email = req.body.email;
            var pendingTasks = req.body.pendingTasks === undefined
                ? [] : req.body.pendingTasks;

            if (typeof name !== 'string' || !name.trim() ||
                typeof email !== 'string' || !email.trim()) {
                return res.status(400).json({
                    message: 'Name and email are required',
                    data: null
                });
            }

            if (!Array.isArray(pendingTasks) ||
                !pendingTasks.every(function (taskId) {
                    return typeof taskId === 'string' &&
                        mongoose.isObjectIdOrHexString(taskId);
                }) ||
                new Set(pendingTasks).size !== pendingTasks.length) {
                return res.status(400).json({
                    message: 'Invalid pendingTasks array',
                    data: null
                });
            }

            var tasks = await Task.find({
                _id: { $in: pendingTasks }
            });

            if (tasks.length !== pendingTasks.length) {
                return res.status(404).json({
                    message: 'One or more tasks not found',
                    data: null
                });
            }

            if (tasks.some(function (task) {
                return task.completed;
            })) {
                return res.status(400).json({
                    message: 'Completed tasks cannot be pending',
                    data: null
                });
            }

            var duplicate = await User.findOne({
                email: email,
                _id: { $ne: user._id }
            });

            if (duplicate) {
                return res.status(400).json({
                    message: 'Email already exists',
                    data: null
                });
            }

            var currentlyAssigned = await Task.find({
                assignedUser: id
            });

            var newPendingSet = new Set(pendingTasks);

            for (var task of currentlyAssigned) {
                var taskId = task._id.toString();

                if (!task.completed && !newPendingSet.has(taskId)) {
                    task.assignedUser = '';
                    task.assignedUserName = 'unassigned';
                } else {
                    task.assignedUserName = name;
                }

                await task.save();
            }

            for (var task of tasks) {
                task.assignedUser = id;
                task.assignedUserName = name;
                await task.save();
            }

            await User.updateMany(
                { _id: { $ne: user._id } },
                { $pull: { pendingTasks: { $in: pendingTasks } } }
            );

            user.name = name;
            user.email = email;
            user.pendingTasks = pendingTasks;

            await user.save();

            return res.status(200).json({
                message: 'User updated successfully',
                data: user
            });

        } catch (err) {
            console.error(err);

            if (err.code === 11000) {
                return res.status(400).json({
                    message: 'Email already exists',
                    data: null
                });
            }

            return res.status(500).json({
                message: 'Unable to update user',
                data: null
            });
        }
    });

    return router;
};