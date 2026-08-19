import LocalStrategy from 'passport-local';
import User from '../models/User.js';

export default function (passport) {
    passport.use(new LocalStrategy.Strategy(
        async (username, password, done) => {
            try {
                const user = await User.findOne({ where: { username: username } });

                if (!user) {
                    return done(null, false, { message: 'Incorrect username.' });
                }

                const isMatch = await user.validPassword(password);
                if (!isMatch) {
                    return done(null, false, { message: 'Incorrect password.' });
                }

                // Removed is_active check - dashboard handles subscription expiry display
                return done(null, user);
            } catch (err) {
                return done(err);
            }
        }
    ));

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findByPk(id);
            if (user && typeof user.settings === 'string') {
                try {
                    user.settings = JSON.parse(user.settings);
                } catch (e) {
                    user.settings = {};
                }
            }
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
};
