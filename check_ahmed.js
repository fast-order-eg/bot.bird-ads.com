import User from './models/User.js';

async function checkAhmed() {
    const user = await User.findOne({ where: { username: 'Ahmedsamir' } });
    console.log('Ahmedsamir settings:', user.settings);
    console.log('Type of settings:', typeof user.settings);
    process.exit(0);
}
checkAhmed().catch(err => {
    console.error(err);
    process.exit(1);
});
