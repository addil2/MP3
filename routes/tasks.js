var Task = require('../models/task');
var mongoose = require('mongoose');
var User = require('../models/user');

module.exports = function (router) {


    router.get('/tasks', async function (req, res) {
        try {
            var where = {};
            var sort = {};
            var select = {};

            try {
                if (req.query.where !== undefined) {
                    where = JSON.parse(req.query.where);
                }

                if (req.query.sort !== undefined) {
                    sort = JSON.parse(req.query.sort);
                }

                if (req.query.select !== undefined) {
                    select = JSON.parse(req.query.select);
                }
            } catch (err) {
                return res.status(400).json({
                    message: 'Invalid JSON query parameter',
                    data: null
                });
            }

            function isObject(value) {
                return value !== null &&
                    typeof value === 'object' &&
                    !Array.isArray(value);
            }

            if (!isObject(where) ||
                !isObject(sort) ||
                !isObject(select)) {
                return res.status(400).json({
                    message: 'Invalid query parameter',
                    data: null
                });
            }

            if (!Object.values(sort).every(function (value) {
                return value === 1 || value === -1;
            })) {
                return res.status(400).json({
                    message: 'Invalid sort parameter',
                    data: null
                });
            }

            function validNonnegativeInteger(value) {
                return typeof value === 'string' &&
                    /^(0|[1-9]\d*)$/.test(value) &&
                    Number.isSafeInteger(Number(value));
            }

            var skip = req.query.skip === undefined
                ? 0 : Number(req.query.skip);

            var limit = req.query.limit === undefined
                ? 100 : Number(req.query.limit);

            if ((req.query.skip !== undefined &&
                !validNonnegativeInteger(req.query.skip)) ||
                (req.query.limit !== undefined &&
                !validNonnegativeInteger(req.query.limit))) {
                return res.status(400).json({
                    message: 'Invalid skip or limit parameter',
                    data: null
                });
            }

            if (req.query.count !== undefined &&
                req.query.count !== 'true' &&
                req.query.count !== 'false') {
                return res.status(400).json({
                    message: 'Invalid count parameter',
                    data: null
                });
            }

            if (req.query.count === 'true') {
                var total = await Task.countDocuments(where);

                return res.status(200).json({
                    message: 'Task count retrieved successfully',
                    data: total
                });
            }

            var query = Task.find(where)
                .sort(sort)
                .select(select)
                .skip(skip)
                .limit(limit);

            var tasks = await query;

            return res.status(200).json({
                message: 'Tasks retrieved successfully',
                data: tasks
            });

        } catch (err) {
            console.error(err);

            return res.status(500).json({
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

            
            var task;

            await mongoose.connection.transaction(async function (session) {
                task = new Task({
                    name: name,
                    deadline: deadline,
                    description: description === undefined ? '' : description,
                    completed: completed === undefined ? false : completed,
                    assignedUser: user ? user._id.toString() : '',
                    assignedUserName: user ? user.name : 'unassigned'
                });

                await task.save({ session: session });

                if (user && !task.completed) {
                    await User.findByIdAndUpdate(
                        user._id,
                        {
                            $addToSet: {
                                pendingTasks: task._id.toString()
                            }
                        },
                        { session: session }
                    );
                }
            });


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

            await mongoose.connection.transaction(async function (session) {
                await User.updateMany(
                    { pendingTasks: id },
                    { $pull: { pendingTasks: id } },
                    { session: session }
                );

                await Task.findByIdAndDelete(id, {
                    session: session
                });
            });

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

            
            await mongoose.connection.transaction(async function (session) {

                await User.updateMany(
                    { pendingTasks: id },
                    { $pull: { pendingTasks: id } },
                    { session: session }
                );

                task.name = name;
                task.deadline = deadline;
                task.description = description;
                task.completed = completed;
                task.assignedUser = newUser ? newUser._id.toString() : '';
                task.assignedUserName = newUser ? newUser.name : 'unassigned';

                await task.save({ session: session });

                if (newUser && !task.completed) {
                    await User.findByIdAndUpdate(
                        newUser._id,
                        {
                            $addToSet: {
                                pendingTasks: task._id.toString()
                            }
                        },
                        { session: session }
                    );
                }
            });


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