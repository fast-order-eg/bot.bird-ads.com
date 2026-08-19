import express from 'express';
import User from '../models/User.js';
import Instruction from '../models/Instruction.js';
import { defaultInstructions } from '../config/defaultInstructions.js';

const router = express.Router();

// Middleware to ensure admin
const isAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.role === 'super_admin') {
        return next();
    }
    res.redirect('/login');
};

router.use(isAdmin);

router.get('/', async (req, res) => {
    try {
        const users = await User.findAll();
        res.render('admin_dashboard', { users, user: req.user, page: 'admin' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/create-user', async (req, res) => {
    try {
        const { username, password, expiry_date } = req.body;
        const newUser = await User.create({
            username,
            password,
            role: 'user',
            expiry_date: expiry_date || null
        });

        // Add Default Instructions
        for (const inst of defaultInstructions) {
            await Instruction.create({
                ...inst,
                UserId: newUser.id
            });
        }

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(400).send('Error creating user');
    }
});

router.post('/update-expiry/:id', async (req, res) => {
    try {
        const { expiry_date } = req.body;
        const user = await User.findByPk(req.params.id);

        user.expiry_date = expiry_date || null;

        // Immediate check logic
        if (expiry_date) {
            const today = new Date().toISOString().split('T')[0];
            if (expiry_date < today) {
                user.is_active = false;
                user.auto_reply = false;
                user.connection_status = 'paused';

                await user.save();

                // Emit status update immediately
                const io = req.app.get('socketio');
                if (io) {
                    io.to(`user_${user.id}`).emit('status', { status: 'paused' });
                }

                console.log(`[Admin] User ${user.username} (ID: ${user.id}) subscription expired. Bot paused.`);
            } else {
                // If date extended to future, reactivate bot
                if (!user.is_active) {
                    user.is_active = true;
                    user.auto_reply = true;
                    user.connection_status = 'online';

                    await user.save();

                    // Emit status update
                    const io = req.app.get('socketio');
                    if (io) {
                        io.to(`user_${user.id}`).emit('status', { status: 'online' });
                    }

                    console.log(`[Admin] User ${user.username} (ID: ${user.id}) subscription extended. Bot reactivated.`);
                }
            }
        }

        await user.save();

        // To truly stop session immediately, we need access to botController's stopSession.
        // Since we can't easily import it without circular, we rely on the flag 'is_active'.
        // The botController logic for 'sendMessage' should checks 'is_active' ideally, or 'connection_status'.
        // If we change status to 'paused', UI updates.

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating expiry date');
    }
});

router.post('/delete-user/:id', async (req, res) => {
    try {
        await User.destroy({ where: { id: req.params.id } });
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting user');
    }
});

router.post('/toggle-status/:id', async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        user.is_active = !user.is_active;
        await user.save();
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating user');
    }
});

export default router;
