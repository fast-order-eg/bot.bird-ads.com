const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sequelize = require('./config/database.js').default || require('./config/database.js');
const Product = require('./models/Product.js').default || require('./models/Product.js');
const Button = require('./models/Button.js').default || require('./models/Button.js');
const Instruction = require('./models/Instruction.js').default || require('./models/Instruction.js');
const User = require('./models/User.js').default || require('./models/User.js');

async function seed() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB');

        const userId = 12; // Ahmedsamir
        
        // 1. Clear old data for this user to avoid duplicates if re-run
        await Button.destroy({ where: { UserId: userId } });
        await Product.destroy({ where: { UserId: userId } });
        await Instruction.destroy({ where: { UserId: userId } });

        console.log('Cleared old data');

        // 2. Create Products
        const productsData = [
            { name: "صور المنتجات", type: "product", description: "اكتشف روعة التحف والنوادر والأحجار الكريمة من خلال معرض الصور الخاص بنا.", isActive: true, UserId: userId },
            { name: "فيديوهات المنتجات", type: "product", description: "استكشف منتجاتنا المميزة من خلال معرض الفيديوهات.", isActive: true, UserId: userId },
            { name: "أحدث عرض", type: "product", description: "يسرنا أن نقدم لكم أحدث عروضنا المميزة على التحف والنوادر والأحجار الكريمة.\n\n🔗 رابط العرض:\n[ضع رابط العرض هنا]\n\n🌟 نتمنى لكم تجربة تسوق ممتعة.", isActive: true, UserId: userId },
            { name: "تابع جميع العروض", type: "product", description: "ابقَ على اطلاع دائم بأحدث عروضنا ومنتجاتنا المميزة من خلال الرابط التالي 👇\n[رابط الموقع أو الحساب]", isActive: true, UserId: userId },
            { name: "الموقع", type: "service", description: "📍 **مواقع فروع محلات الإخوة للتحف والنوادر والأحجار الكريمة**\n\n🏢 **الفرع الرئيسي – مطرح**\n📍 مسقط، مطرح، الكورنيش 126\nhttps://maps.app.goo.gl/HFQLA5UdZLZUkwVQ9?g_st=aw\n📞 95535538 | 79991184 | 95535536\n\n🏢 **فرع السيب**\n📍 الموقع: https://g.co/kgs/GQ9MU2v\n📞 95535538\n\n🏢 **فرع بركاء**\n📍 الموقع: https://g.co/kgs/Noeuhbn\n📞 76331415\n\n🏢 **فرع صحار**\n📍 الموقع: https://g.co/kgs/pYPNdH5\n📞 95535537\n\n🏢 **فرع صلالة**\n📍 الموقع: https://g.co/kgs/C61jq83\n📞 92284259\n\n📞 **للاستفسارات والملاحظات:**\n📱 96352778\n📱 77770055", isActive: true, UserId: userId },
            { name: "وسائل التواصل الاجتماعي", type: "service", description: "🌐 يسعدنا تواصلكم معنا عبر منصاتنا الرسمية\n\n📸 انستجرام\nhttps://www.instagram.com/mmm91470640\n\n📘 فيسبوك\nhttps://www.facebook.com/share/16UK1Pp3xv/\n\n🎵 تيك توك\nhttps://www.tiktok.com/@ashy72541751\n\n▶️ قناة اليوتيوب\nhttps://youtube.com/channel/UCyMPK5MsLkJdlL_wvxMVGvw\n\n📞 للاستفسارات وطلبات الشراء:\n96352778 | 77770055", isActive: true, UserId: userId },
            { name: "قيّمنا على Google", type: "service", description: "⭐ **رأيك يهمنا ويسعدنا تقييمك لنا على Google**\n\nيساعدنا تقييمكم في تحسين خدماتنا وتقديم تجربة أفضل لكم دائماً.\n\n📍 الفرع الرئيسي – مطرح\nمسقط – مطرح، الكورنيش 126\n\n🔗 رابط التقييم:\nhttps://maps.app.goo.gl/cyqGPxqm5xt2utCH7", isActive: true, UserId: userId },
            { name: "معلومات خدمة العملاء", type: "service", description: "💐 **خدمة العملاء**\n\nيسعدنا خدمتكم والإجابة على جميع استفساراتكم.\n\n📍 **مبيعات مطرح**\n📞 95535538 | 79991184\n\n📍 **مبيعات السيب**\n📞 91990543\n\n📍 **مبيعات بركاء**\n📞 76331415\n\n📍 **مبيعات صحار**\n📞 95535537\n\n📍 **مبيعات صلالة**\n📞 92284259\n\n📞 **للاستفسارات والملاحظات**\n📞 77770055", isActive: true, UserId: userId },
            { name: "الدفع والشحن", type: "service", description: "🚚 الدفع والشحن\n\n📦 للتواصل مع قسم الشحن (مطرح):\n📞 79991184\n\n💳 بيانات الدفع\n🏦 بنك مسقط\nرقم الحساب: 0339056250690015\nاسم المستفيد: محمد صغير قاسم المعمري\n📱 التحويل عبر الرقم: 91470640\n\n⚠️ ملاحظة هامة\nحرصًا على سرعة معالجة طلبكم، يرجى إرسال صورة أو إيصال التحويل بعد إتمام عملية الدفع، حيث لا يتم اعتماد المبلغ في النظام إلا بعد التحقق من التحويل.", isActive: true, UserId: userId }
        ];

        const createdProducts = {};
        for (const p of productsData) {
            const product = await Product.create(p);
            createdProducts[p.name] = product.id;
        }
        console.log('Created Products');

        // 3. Create Buttons Hierarchy
        // L0: Arabic / English
        const arBtn = await Button.create({
            text: "العربية 🇴🇲",
            replyMessage: "🌟 شكرًا لاختيارك اللغة العربية\n\nمرحبًا بك في محلات الإخوة للتحف والنوادر والأحجار الكريمة 😊\n\nيرجى اختيار القسم الذي ترغب بالاستفسار عنه من القائمة التالية 👇",
            order: 1,
            UserId: userId
        });
        
        const enBtn = await Button.create({
            text: "English 🇬🇧",
            replyMessage: "Thank you for choosing English. Please note our English menu is currently being updated. Contact our support for assistance.",
            order: 2,
            UserId: userId
        });

        // L1: Sections under Arabic
        const productsOffersBtn = await Button.create({
            text: "🛍️ المنتجات والعروض",
            replyMessage: "🛍️ استكشف منتجاتنا وعروضنا المميزة\nيرجى اختيار القسم المطلوب من الخيارات التالية 👇",
            order: 1,
            ParentId: arBtn.id,
            UserId: userId
        });

        const storeInfoBtn = await Button.create({
            text: "📍 معلومات المتجر والتواصل",
            replyMessage: "📍 معلومات المتجر والتواصل\n\nيرجى اختيار الخدمة المطلوبة من الخيارات التالية 👇",
            order: 2,
            ParentId: arBtn.id,
            UserId: userId
        });

        const csBtn = await Button.create({
            text: "👨💼 خدمة العملاء",
            replyMessage: "👨💼 خدمة العملاء\n\nيسعدنا خدمتكم، يرجى اختيار الخدمة المطلوبة 👇",
            order: 3,
            ParentId: arBtn.id,
            UserId: userId
        });

        // L2: Under Products and Offers
        const productsBtn = await Button.create({
            text: "🛒 المنتجات",
            replyMessage: "اكتشف مجموعتنا المميزة من التحف والنوادر والأحجار الكريمة من خلال الخيارات التالية 👇",
            order: 1,
            ParentId: productsOffersBtn.id,
            UserId: userId
        });

        const offersBtn = await Button.create({
            text: "🎁 العروض",
            replyMessage: "اكتشف أحدث عروضنا وابقَ على اطلاع دائم بأحدث المنتجات والعروض الحصرية من خلال الخيارات التالية 👇",
            order: 2,
            ParentId: productsOffersBtn.id,
            UserId: userId
        });

        // L3: Under Products
        await Button.create({
            text: "🖼️ صور المنتجات",
            ProductId: createdProducts["صور المنتجات"],
            order: 1,
            ParentId: productsBtn.id,
            UserId: userId
        });

        await Button.create({
            text: "🎥 فيديوهات المنتجات",
            ProductId: createdProducts["فيديوهات المنتجات"],
            order: 2,
            ParentId: productsBtn.id,
            UserId: userId
        });

        // L3: Under Offers
        await Button.create({
            text: "🔥 أحدث عرض",
            ProductId: createdProducts["أحدث عرض"],
            order: 1,
            ParentId: offersBtn.id,
            UserId: userId
        });

        await Button.create({
            text: "✨ تابع جميع العروض",
            ProductId: createdProducts["تابع جميع العروض"],
            order: 2,
            ParentId: offersBtn.id,
            UserId: userId
        });

        // L2: Under Store Info
        await Button.create({
            text: "📍 الموقع",
            ProductId: createdProducts["الموقع"],
            order: 1,
            ParentId: storeInfoBtn.id,
            UserId: userId
        });

        await Button.create({
            text: "🔗 وسائل التواصل",
            ProductId: createdProducts["وسائل التواصل الاجتماعي"],
            order: 2,
            ParentId: storeInfoBtn.id,
            UserId: userId
        });

        await Button.create({
            text: "⭐ قيّمنا على Google",
            ProductId: createdProducts["قيّمنا على Google"],
            order: 3,
            ParentId: storeInfoBtn.id,
            UserId: userId
        });

        // L2: Under Customer Service
        await Button.create({
            text: "💐 خدمة العملاء",
            ProductId: createdProducts["معلومات خدمة العملاء"],
            order: 1,
            ParentId: csBtn.id,
            UserId: userId
        });

        await Button.create({
            text: "🚚 الدفع والشحن",
            ProductId: createdProducts["الدفع والشحن"],
            order: 2,
            ParentId: csBtn.id,
            UserId: userId
        });

        await Button.create({
            text: "📞 التحدث مع موظف",
            actionTarget: "talk_to_agent",
            order: 3,
            ParentId: csBtn.id,
            UserId: userId
        });

        console.log('Created Buttons');

        // 4. Create Instructions for AI
        const instructionsData = [
            {
                clientName: "معلومات المتجر",
                title: "محلات الإخوة للتحف والنوادر",
                content: "نحن محلات الإخوة للتحف والنوادر والأحجار الكريمة.\nنوفر تشكيلة مميزة من التحف والنوادر، الأحجار الكريمة، والهدايا والمقتنيات الفريدة.",
                keywords: "محلات الإخوة, من انتم, ما هو متجركم, تحف, نوادر, احجار كريمة",
                isActive: true,
                UserId: userId
            },
            {
                clientName: "الفروع والمواقع",
                title: "فروعنا وأرقام الهواتف",
                content: "لدينا عدة فروع في سلطنة عمان:\n1. الفرع الرئيسي (مطرح): مسقط، مطرح، الكورنيش 126. هواتف: 95535538, 79991184, 95535536.\n2. فرع السيب: هاتف 95535538, 91990543\n3. فرع بركاء: هاتف 76331415\n4. فرع صحار: هاتف 95535537\n5. فرع صلالة: هاتف 92284259\n\nللاستفسارات العامة والملاحظات يرجى التواصل مع خدمة العملاء على 96352778 أو 77770055.",
                keywords: "الفروع, فرع, مكانكم, موقعكم, فينكم, ارقام الهواتف, رقم التليفون, مطرح, السيب, بركاء, صحار, صلالة",
                isActive: true,
                UserId: userId
            },
            {
                clientName: "الدفع والشحن",
                title: "طرق الدفع والشحن المتاحة",
                content: "للتواصل مع قسم الشحن (في مطرح) يرجى الاتصال على 79991184.\n\nبيانات الدفع المتاحة:\nبنك مسقط\nرقم الحساب: 0339056250690015\nاسم المستفيد: محمد صغير قاسم المعمري\nيمكن التحويل المباشر عبر الرقم: 91470640\n\nملاحظة هامة جداً: يجب إرسال صورة أو إيصال التحويل بعد الدفع لاعتماد المبلغ في النظام ولضمان سرعة معالجة الطلب.",
                keywords: "الدفع, ادفع ازاي, طرق الدفع, بنك مسقط, التحويل, الشحن, توصيل, شحن",
                isActive: true,
                UserId: userId
            },
            {
                clientName: "وسائل التواصل",
                title: "حساباتنا على السوشيال ميديا",
                content: "يسعدنا تواصلكم ومتابعتكم لجديدنا على:\nانستجرام: https://www.instagram.com/mmm91470640\nفيسبوك: https://www.facebook.com/share/16UK1Pp3xv/\nتيك توك: https://www.tiktok.com/@ashy72541751\nقناة اليوتيوب: https://youtube.com/channel/UCyMPK5MsLkJdlL_wvxMVGvw",
                keywords: "انستجرام, انستا, فيسبوك, فيس, تيك توك, تيكتوك, يوتيوب, قناه اليوتيوب, سوشيال, التواصل الاجتماعي",
                isActive: true,
                UserId: userId
            }
        ];

        for (const i of instructionsData) {
            await Instruction.create(i);
        }
        console.log('Created Instructions');

        // 5. Update user's fixedReply to match the Welcome Message
        await User.update({
            fixedReply: "🌟 مرحبًا بك في محلات الإخوة للتحف والنوادر والأحجار الكريمة 🌟\n\nنشكر تواصلك معنا، ويسعدنا خدمتك 😊\n\nنوفر لكم تشكيلة مميزة من:\n🏺 التحف والنوادر\n💎 الأحجار الكريمة\n🎁 الهدايا والمقتنيات الفريدة\n\nيرجى اختيار لغتك المفضلة للمتابعة:\n\n━━━━━━━━━━━━━━\n\n🌟 Welcome to Al Ikhwa Antiques, Collectibles & Gemstones 🌟\n\nThank you for contacting us. We are delighted to assist you 😊\n\nWe offer a unique collection of:\n🏺 Antiques & Collectibles\n💎 Gemstones & Crystals\n🎁 Unique Gifts & Rare Items\n\nPlease select your preferred language to continue:"
        }, { where: { id: userId } });
        console.log('Updated User Fixed Reply');

        console.log('Seed completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Seed error:', err);
        process.exit(1);
    }
}

seed();
