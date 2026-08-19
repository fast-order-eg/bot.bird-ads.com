import fs from 'fs';

const filePath = '/home/bird-ads.com/bot.bird-ads.com/controllers/messengerController.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Allow instagram object in handleWebhook
content = content.replace(
    "if (body.object !== 'page') {",
    "if (body.object !== 'page' && body.object !== 'instagram') {"
);
*// 2. Allow comments field in handleWebhook
content = content.replace(
    "if (change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') {",
    "if ((change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') || change.field === 'comments') {"
C;

// 3. Page lookup by pageId or instagramId in handleCommentEvent
content = content.replace(
    "const page = await MessengerPage.findOne({ where: { pageId, isActive: true } });",
    "const { Op } = await import('sequelize');\n    const page = await MessengerPage.findOne({ where: { [Op.or]: [{ pageId }, { instagramId: pageId } ], isActive: true } });"
);
*// 4. Map comment variables for Instagram
content = content.replace(
    "const commentId = commentData.comment_id;",
    "const commentId = commentData.comment_id || commentData.id;"
);
content = content.replace(
    "const commenterName = commentData.from?.name || 'Ø§Ù„Ø¹Ù…ÙfØ§;",
    "const commenterName = commentData.from?.name || commentData.from?.username || '=Š}˜M‹˜]–mŠs² ¢“°¦6öçFVçBÒ6öçFVçBç&WÆ6R€¢&6öç7B6öÖÖVçEFW‡BÒ6öÖÖVçDFFæÖW76vRÇÂrs²"À¢&6öç7B6öÖÖVçEFW‡BÒ6öÖÖVçDFFæÖW76vRÇÂ6öÖÖVçDFFçFW‡BÇÂrs² ¢“°¢¢òòRâWFFR&WÇ•Fô6öÖÖVçBFòG'’÷&WÆ–W2VæGö–çBf—'7@¦6öç7BöÆE&WÇ’Ò7–æ2gVæ7F–öâ&WÇ•Fô6öÖÖVçB†6öÖÖVçD–BÂÖW76vRÂ66W75Fö¶Vâ’°¢G'’°¢6öç7B&W7öç6RÒv—BfWF6‚†‡GG3¢òöw&‚æf6V&öö²æ6öÒ÷c‚ãòG¶6öÖÖVçD–GÒö6öÖÖVçG3ö66W75÷Fö¶VãÒG¶66W75Fö¶VçÖÂ°¢ÖWF†öC¢uõ5BrÀ¢†VFW'3¢²t6öçFVçBÕG—Rs¢vÆ–6F–öâö§6öârÒÀ¢&öG“¢¥4ôâç7G&–æv–g’‡²ÖW76vS¢ÖW76vRç7V'7G&–ærƒÂ#’Ò¢Ò“°¢6öç7BFFÒv—B&W7öç6Ræ§6öâ‚“°¢–b†FFæ–B’°¢6öç6öÆRæÆör†)È’´6öÖÖVçEÒ&WÆ–VBFò6öÖÖVçC¢G¶6öÖÖVçD–GÖ“°¢ÒVÇ6R°¢6öç6öÆRçv&â‚~8©¢´6öÖÖVçEÒf–ÆVBFò&WÇ’Fò6öÖÖVçBG¶6öÖÖVçD–GÓ¢rÂFF“°¢Ğ¢Ò6F6‚†W'"’°¢6öç6öÆRæW'&÷"‚u´6öÖÖVçEÒW'&÷"&WÇ––ærFò6öÖÖVçBG¶6öÖÖVçD–GÓ¢rÂW'"“°¢Ğ§Ö° ¦6öç7BæWu&WÇ’Ò7–æ2gVæ7F–öâ&WÇ•Fô6öÖÖVçB†6öÖÖVçD–BÂÖW76vRÂ66W75Fö¶Vâ’°¢G'’°¢ÆWB&W7öç6RÒv—BfWF6‚†‡GG3¢òöw&‚æf6V&öö²æ6öÒ÷c‚ãòG¶6öÖÖVçD–GÒ÷&WÆ–W3ö66W75÷Fö¶VãÒG¶66W75Fö¶VçÖÂ°¢ÖWF†öC¢uõ5BrÀ¢†VFW'3¢²t6öçFVçBÕG—Rs¢vÆ–6F–öâö§6öârÒÀ¢&öG“¢¥4ôâç7G&–æv–g’‡²ÖW76vS¢ÖW76vRç7V'7G&–ærƒÂ#’Ò¢Ò“°¢ÆWBFFÒv—B&W7öç6Ræ§6öâ‚“°¢–b‚FFæ–B’°¢&W7öç6RÒv—BfWF6‚†‡GG3¢òöw&‚æf6V&öö²æ6öÒ÷c‚ãòG¶6öÖÖVçD–GÒö6öÖÖVçG3ö66W75÷Fö¶VãÒG¶66W75Fö¶VçÖÂ°¢ÖWF†öC¢uõ5BrÀ¢†VFW'3¢²t6öçFVçBÕG—Rs¢vÆ–6F–öâö§6öârÒÀ¢&öG“¢¥4ôâç7G&–æv–g’‡²ÖW76vS¢ÖW76vRç7V'7G&–ærƒÂ#’Ò¢Ò“°¢FFÒv—B&W7öç6Ræ§6öâ‚“°¢Ğ¢–b†FFæ–B’°¢6öç6öÆRæÆör†)È’´6öÖÖVçEÒ&WÆ–VBFò6öÖÖVçC¢G¶6öÖÖVçD–GÒÂ&WÇ’”C¢G¶FFæ–GÖ“°¢ÒVÇ6R°¢6öç6öÆRçv&â†v&â´6öÖÖVçEÒf–ÆVBFò&WÇ’Fò6öÖÖVçBG¶6öÖÖVçD–GÓ¦ÂFF“°¢Ğ¢Ò6F6‚†W'"’°¢6öç6öÆRæW'&÷"‚u´6öÖÖVçEÒW'&÷"&WÇ––ærFò6öÖÖVçBG¶6öÖÖVçD–GÓ¢rÂW'"“°¢Ğ§Ö° ¦6öçFVçBÒ6öçFVçBç&WÆ6R†öÆE&WÇ’ÂæWu&WÇ’“° ¢òòbâWFFR6VæE&—fFU&WÇ•Fô6öÖÖVçBFò†æFÆR–ç7Fw&ÒD×0¦6öç7BöÆE&—bÒ7–æ2gVæ7F–öâ6VæE&—fFU&WÇ•Fô6öÖÖVçB†6öÖÖVçD–BÂÖW76vRÂ66W75Fö¶VâÂV–6µ&WÆ–W2ÒçVÆÂ’¶°¦6öç7BæWu&—fÂÒ7–æ2gVæ7F–öâ6VæE&—fFU&WÇ•Fô6öÖÖVçB†6öÖÖVçD–BÂÖW76vRÂ66W75Fö¶VâÂV–6µ&WÆ–W2ÒçVÆÂÂ–ç7Fw&Ô–BÒçVÆÂ’°¢–b†–ç7Fw&Ô–B’°¢G'’°¢6öç7B&W7öç6RÒv—BfWF6‚†‡GG3¢òöw&‚æf6V&öö²æ6öÒ÷c‚ãòG¶–ç7Fw&Ô–GÒöÖW76vW3ö66W75÷Fö¶VãÓÒG¶66W75Fö¶VçÖÂ°¢ÖWF†öC¢uõ5BrÀ¢†VFW'3¢²t6öçFVçBÕG—Rs¢vÆ–6F–öâö§6öârÒÀ¢&öG“¢¥4ôâç7G&–æv–g’‡°¢&V6—–VçC¢²6öÖÖVçEö–C¢6öÖÖVçD–BÒÀ¢ÖW76vS¢²FW‡C¢ÖW76vRĞ¢Ò¢Ò“°¢6öç7BFFÒv—B&W7öç6Ræ§6öâ‚“°¢–b†FFæÖW76vUö–B’°¢6öç6öÆRæÆör†)È’´–ç7Fw&ÕÒ&—fFRDÒ6VçBf÷"6öÖÖVçBG¶6öÖÖVçD–GÒÂ”C¢G¶FFæÖW76vUö–GÖ“°¢&WGW&âFFæÖW76vUö–C°¢ÒVÇ6R°¢6öç6öÆRçv&â†v&â´–ç7Fw&ÕÒf–ÆVB&—fFRDÒf÷"6öÖÖVçBG¶6öÖÖVçD–GÓ¦ÂFF“°¢Ğ¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"‚u´–ç7Fw&ÕÒW'&÷"6VæF–ær&—fFRDÓ¢rÂR“°¢Ğ¢Ö° ¦6öçFVçBÒ6öçFVçBç&WÆ6R†öÆE&—bÂæWu&—fÂ“° ¦6öçFVçBÒ6öçFVçBç&WÆ6R€¢&6öç7B6–BÒv—B6VæE&—fFU&WÇ•Fô6öÖÖVçB†6öÖÖVçD–BÂf—†VD×6rÂ66W75Fö¶VâÂV–6µ&WÆ–W2“²"À¢&6öç7B6–BÒv—B6VæE&—fFU&WÇ•Fô6öÖÖVçB†6öÖÖVçD–BÂf—†VD×6rÂ66W75Fö¶VâÂV–6¶U&WÆ–W2ÂvRæ–ç7Fw&Ô–B“² ¢“° ¦g2çw&—FTf–ÆU7–æ2†f–ÆUF‚Â6öçFVçBÂwWFc‚r“°¦6öç6öÆRæÆör‚uD4…ô”uõ5T44U52r“°