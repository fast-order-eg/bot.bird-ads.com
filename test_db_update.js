import User from './models/User.js';

async function test() {
    const user = await User.findByPk(1);
    console.log('Old settings:', user.settings);
    
    let currentSettings = typeof user.settings === 'string' ? JSON.parse(user.settings) : { ...user.settings };
    currentSettings.bot_name = "Test Name " + Date.now();
    
    user.settings = currentSettings;
    user.changed('settings', true);
    await user.save();
    
    const userAfter = await User.findByPk(1);
    console.log('New settings:', userAfter.settings);
}
test().catch(console.error);
