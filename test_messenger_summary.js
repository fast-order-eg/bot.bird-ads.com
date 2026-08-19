import sequelize from './config/database.js';
import { generateConversationSummary } from './controllers/messengerController.js';
import User from './models/User.js';
import Message from './models/Message.js';

async function runTest() {
    console.log('⏳ جاري اختبار ميزة ملخص محادثات الماسنجر...');
    
    // تأكدنا من إن الداتا بيز شغالة
    await sequelize.authenticate();
    
    // هنجيب أدمن عشان نربط بيه الرسايل
    const user = await User.findOne();
    if (!user) {
        console.log('❌ مفيش يوزر في الداتا بيز!');
        return;
    }
    
    const fakeConversationId = 'msng_mockpage_mocksender';
    
    console.log('📝 جاري إنشاء محادثة وهمية للاختبار...');
    await Message.create({
        UserId: user.id,
        remoteJid: fakeConversationId,
        role: 'user',
        content: 'بكام الدورة التدريبية بتاعت المبيعات؟'
    });
    
    await Message.create({
        UserId: user.id,
        remoteJid: fakeConversationId,
        role: 'model',
        content: 'الدورة دي مسجلة وبـ 1000 جنيه، وفي خصم 20% لو اشتركت النهاردة، تحب تشترك؟'
    });
    
    await Message.create({
        UserId: user.id,
        remoteJid: fakeConversationId,
        role: 'user',
        content: 'أيوة ياريت، إيه طرق الدفع المتاحة للخصم؟'
    });

    console.log('🤖 بنبعت لـ Vertex AI عشان يعمل الملخص...');
    const summary = await generateConversationSummary(user.id, fakeConversationId);
    
    console.log('\n================================');
    console.log('✅ نتيجة الملخص من الذكاء الاصطناعي:');
    console.log(summary);
    console.log('================================\n');

    // تنظيف الداتا الوهمية
    await Message.destroy({ where: { remoteJid: fakeConversationId } });
    console.log('🧹 تم تنظيف بيانات الاختبار بنجاح.');
}

runTest().then(() => process.exit(0)).catch(err => { 
    console.error('❌ خطأ أثناء الاختبار:', err); 
    process.exit(1); 
});
