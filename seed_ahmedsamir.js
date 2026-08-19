import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import sequelize from './config/database.js';
import Product from './models/Product.js';
import InteractiveMenu from './models/InteractiveMenu.js';
import InteractiveButton from './models/InteractiveButton.js';
import Instruction from './models/Instruction.js';
import User from './models/User.js';

async function seed() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB');

        const user = await User.findOne({ where: { username: 'Brothers_stores' } });
        if (!user) {
            console.error('User Brothers_stores not found');
            process.exit(1);
        }
        const userId = user.id;
        // 1. Clear old data for this user
        await InteractiveButton.destroy({ where: { UserId: userId } });
        await InteractiveMenu.destroy({ where: { UserId: userId } });
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

        // 3. Create Menus
        const mainMenu = await InteractiveMenu.create({
            menuName: "القائمة الرئيسية",
            triggerWords: "menu,القائمة,الرئيسية",
            welcomeMessage: "🌟 مرحبًا بك في محلات الإخوة للتحف والنوادر والأحجار الكريمة 🌟\n\nنشكر تواصلك معنا، ويسعدنا خدمتك 😊\n\nنوفر لكم تشكيلة مميزة من:\n🏺 التحف والنوادر\n💎 الأحجار الكريمة\n🎁 الهدايا والمقتنيات الفريدة\n\nيرجى اختيار لغتك المفضلة للمتابعة:\n\n━━━━━━━━━━━━━━\n\n🌟 Welcome to Al Ikhwa Antiques, Collectibles & Gemstones 🌟\n\nThank you for contacting us. We are delighted to assist you 😊\n\nWe offer a unique collection of:\n🏺 Antiques & Collectibles\n💎 Gemstones & Crystals\n🎁 Unique Gifts & Rare Items\n\nPlease select your preferred language to continue:",
            isDefault: true,
            UserId: userId
        });

        const arMenu = await InteractiveMenu.create({
            menuName: "القائمة العربية",
            triggerWords: "ar_menu,عربي",
            welcomeMessage: "🌟 شكرًا لاختيارك اللغة العربية\n\nمرحبًا بك في محلات الإخوة للتحف والنوادر والأحجار الكريمة 😊\n\nيرجى اختيار القسم الذي ترغب بالاستفسار عنه من القائمة التالية 👇",
            isDefault: false,
            UserId: userId
        });

        const productsOffersMenu = await InteractiveMenu.create({
            menuName: "المنتجات والعروض",
            triggerWords: "products_offers",
            welcomeMessage: "🛍️ استكشف منتجاتنا وعروضنا المميزة\nيرجى اختيار القسم المطلوب من الخيارات التالية 👇",
            isDefault: false,
            UserId: userId
        });

        const productsMenu = await InteractiveMenu.create({
            menuName: "المنتجات",
            triggerWords: "products",
            welcomeMessage: "اكتشف مجموعتنا المميزة من التحف والنوادر والأحجار الكريمة من خلال الخيارات التالية 👇",
            isDefault: false,
            UserId: userId
        });

        const offersMenu = await InteractiveMenu.create({
            menuName: "العروض",
            triggerWords: "offers",
            welcomeMessage: "اكتشف أحدث عروضنا وابقَ على اطلاع دائم بأحدث المنتجات والعروض الحصرية من خلال الخيارات التالية 👇",
            isDefault: false,
            UserId: userId
        });

        const storeInfoMenu = await InteractiveMenu.create({
            menuName: "معلومات المتجر والتواصل",
            triggerWords: "store_info",
            welcomeMessage: "📍 معلومات المتجر والتواصل\n\nيرجى اختيار الخدمة المطلوبة من الخيارات التالية 👇",
            isDefault: false,
            UserId: userId
        });

        const csMenu = await InteractiveMenu.create({
            menuName: "خدمة العملاء",
            triggerWords: "customer_service",
            welcomeMessage: "👨💼 خدمة العملاء\n\nيرجى اختيار الخدمة المطلوبة 👇",
            isDefault: false,
            UserId: userId
        });

        console.log('Created Menus');

        // 4. Create Buttons
        // Main Menu Buttons
        await InteractiveButton.create({
            label: "العربية 🇴🇲",
            buttonId: "btn_ar",
            responseText: "تم اختيار اللغة العربية",
            MenuId: mainMenu.id,
            NextMenuId: arMenu.id,
            order: 1,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "English 🇬🇧",
            buttonId: "btn_en",
            responseText: "Thank you for choosing English. Please note our English menu is currently being updated. Contact our support for assistance.",
            MenuId: mainMenu.id,
            order: 2,
            UserId: userId
        });

        // Arabic Menu Buttons
        await InteractiveButton.create({
            label: "🛍️ المنتجات والعروض",
            buttonId: "btn_products_offers",
            responseText: "تم اختيار قسم المنتجات والعروض",
            MenuId: arMenu.id,
            NextMenuId: productsOffersMenu.id,
            order: 1,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "📍 معلومات المتجر",
            buttonId: "btn_store_info",
            responseText: "تم اختيار قسم معلومات المتجر",
            MenuId: arMenu.id,
            NextMenuId: storeInfoMenu.id,
            order: 2,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "👨💼 خدمة العملاء",
            buttonId: "btn_cs",
            responseText: "تم اختيار قسم خدمة العملاء",
            MenuId: arMenu.id,
            NextMenuId: csMenu.id,
            order: 3,
            UserId: userId
        });

        // Products and Offers Menu Buttons
        await InteractiveButton.create({
            label: "🛒 المنتجات",
            buttonId: "btn_products",
            responseText: "تم اختيار قسم المنتجات",
            MenuId: productsOffersMenu.id,
            NextMenuId: productsMenu.id,
            order: 1,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "🎁 العروض",
            buttonId: "btn_offers",
            responseText: "تم اختيار قسم العروض",
            MenuId: productsOffersMenu.id,
            NextMenuId: offersMenu.id,
            order: 2,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "↩️ القائمة الرئيسية",
            buttonId: "btn_main_menu",
            responseText: "العودة للقائمة الرئيسية",
            MenuId: productsOffersMenu.id,
            NextMenuId: mainMenu.id,
            order: 3,
            UserId: userId
        });

        // Products Menu
        await InteractiveButton.create({
            label: "🖼️ صور المنتجات",
            buttonId: "btn_prod_images",
            responseText: "صور المنتجات",
            ProductId: createdProducts["صور المنتجات"],
            MenuId: productsMenu.id,
            order: 1,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "🎥 فيديوهات المنتجات",
            buttonId: "btn_prod_videos",
            responseText: "فيديوهات المنتجات",
            ProductId: createdProducts["فيديوهات المنتجات"],
            MenuId: productsMenu.id,
            order: 2,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "↩️ رجوع",
            buttonId: "btn_back_prod",
            responseText: "رجوع",
            MenuId: productsMenu.id,
            NextMenuId: productsOffersMenu.id,
            order: 3,
            UserId: userId
        });

        // Offers Menu
        await InteractiveButton.create({
            label: "🔥 أحدث عرض",
            buttonId: "btn_latest_offer",
            responseText: "أحدث عرض",
            ProductId: createdProducts["أحدث عرض"],
            MenuId: offersMenu.id,
            order: 1,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "✨ تابع جميع العروض",
            buttonId: "btn_all_offers",
            responseText: "جميع العروض",
            ProductId: createdProducts["تابع جميع العروض"],
            MenuId: offersMenu.id,
            order: 2,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "↩️ رجوع",
            buttonId: "btn_back_offers",
            responseText: "رجوع",
            MenuId: offersMenu.id,
            NextMenuId: productsOffersMenu.id,
            order: 3,
            UserId: userId
        });

        // Store Info Menu
        await InteractiveButton.create({
            label: "📍 الموقع",
            buttonId: "btn_location",
            responseText: "موقعنا",
            ProductId: createdProducts["الموقع"],
            MenuId: storeInfoMenu.id,
            order: 1,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "🔗 وسائل التواصل",
            buttonId: "btn_social",
            responseText: "حساباتنا",
            ProductId: createdProducts["وسائل التواصل الاجتماعي"],
            MenuId: storeInfoMenu.id,
            order: 2,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "⭐ قيّمنا",
            buttonId: "btn_rate_us",
            responseText: "تقييمك يهمنا",
            ProductId: createdProducts["قيّمنا على Google"],
            MenuId: storeInfoMenu.id,
            order: 3,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "↩️ القائمة الرئيسية",
            buttonId: "btn_back_info",
            responseText: "رجوع",
            MenuId: storeInfoMenu.id,
            NextMenuId: arMenu.id, // Or Main Menu
            order: 4,
            UserId: userId
        });

        // Customer Service Menu
        await InteractiveButton.create({
            label: "💐 خدمة العملاء",
            buttonId: "btn_cs_info",
            responseText: "خدمة العملاء",
            ProductId: createdProducts["معلومات خدمة العملاء"],
            MenuId: csMenu.id,
            order: 1,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "🚚 الدفع والشحن",
            buttonId: "btn_payment",
            responseText: "الدفع والشحن",
            ProductId: createdProducts["الدفع والشحن"],
            MenuId: csMenu.id,
            order: 2,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "📞 موظف خدمة عملاء",
            buttonId: "btn_human",
            responseText: "التحدث مع موظف",
            actionType: "talk_to_agent",
            MenuId: csMenu.id,
            order: 3,
            UserId: userId
        });
        await InteractiveButton.create({
            label: "↩️ القائمة الرئيسية",
            buttonId: "btn_back_cs",
            responseText: "رجوع",
            MenuId: csMenu.id,
            NextMenuId: arMenu.id,
            order: 4,
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
