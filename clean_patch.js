import fs from 'fs';


const path = '/home/bird-ads.com/bot.bird-ads.com/controllers/messengerController.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace("if (body.object !== 'page') {", "if (body.object !== 'page' && body.object !== 'instagram') {");

const c = content.replace(
  "if (change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') {",
  "if ((change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') || change.field === 'comments') {"
).replace(
  "const page = await MessengerPage.findOne({ where: { pageId, isActive: true } });",
  "const { Op } = await import('sequelize');\n    const page = await MessengerPage.findOne({ where: { [Op.or]: [{ pageId }, { instagramId: pageId } ], isActive: true } });"
).replace(
  "const commentId = commentData.comment_id;",
  "const commentId = commentData.comment_id || commentData.id;"
).replace(
  "const commenterName = commentData.from?.name || '=Š}˜M‹˜]–mŠs²"À¢&6öç7B6öÖÖVçFW$æÖRÒ6öÖÖVçDFFæg&öÓòææÖRÇÂ6öÖÖVçDFFæg&öÓòçW6W&æÖRÇÂ|*}˜M‹˜]™˜¢s² ¢’ç&WÆ6R€¢&6öç7B6öÖÖVçEFW‡BÒ6öÖÖVçDFFæÖW76vRÇÂrs²"À¢&6öç7B6öÖÖVçEFW‡BÒ6öÖÖVçDFFæÖW76vRÇÂ6öÖÖVçDFFçFW‡BÇÂrs² ¢’ç&WÆ6R€¢&‡GG3¢òöw&‚æf6V&öö²æ6öÒ÷c‚ãòG¶6öÖÖVçD–GÒö6öÖÖVçG3ö66W75÷Fö¶VãÓÒG¶66W75Fö¶VçÒ"À¢&‡GG3¢òöw&‚æf6V&öö²æ6öÒ÷c‚ãòG¶6öÖÖVçD–GÒ÷&WÆ–W3ö66W75÷Fö¶VãÒG¶66W75Fö¶VçÒ ¢’ç&WÆ6R€¢&7–æ2gVæ7F–öâ6VæE&—fFU&WÇ•Fô6öÖÖVçB†6öÖÖVçD–BÂÖW76vRÂ66W75Fö¶VâÂV–6µ&WÆ–W2ÒçVÆÂ’²"À¢&7–æ2gVæ7F–öâ6VæE&—fFU&WÇ•Fô6öÖÖVçB†6öÖÖVçD–BÂÖW76vRÂ66W75Fö¶VâÂV–6µ&WÆ–W2ÒçVÆÂÂ–ç7Fw&Ô–BÒçVÆÂ’µÆâ–b†–ç7Fw&Ô–B’µÆâG'’µÆâ6öç7B&W2Òv—BfWF6‚‚v‡GG3¢òöw&‚æf6V&öö²æ6öÒ÷c‚ãòr²–ç7Fw&Ô–B²röÖW76vW3ö66W75÷Fö¶VãÒr²66W75Fö¶VâÂµÆâÖWF†öC¢uõ5BrÅÆâ†VFW'3¢²t6öçFVçBÕG—Rs¢vÆ–6F–öâö§6öârÒÅÆâ&öG“¢¥4ôâç7G&–æv–g’‡²&V6—–VçC¢²6öÖÖVçEö–C¢6öÖÖVçD–BÒÂÖW76vS¢²FW‡C¢ÖW76vRÒÒ•ÆâÒ“µÆâ6öç7BBÒv—B&W2æ§6öâ‚“µÆâ–b†BæÖW76vUö–B’&WGW&âBæÖW76vUö–CµÆâÒ6F6‚†R’·ÕÆâÒ ¢’ç&WÆ6R€¢&6öç7B6–BÒv—B6VæE&—fFU&WÇ•Fô6öÖÖVçB†6öÖÖVçD–BÂf—†VD×6rÂ66W75Fö¶VâÂV–6µ&WÆ–W2“²"À¢&6öç7B6–BÒv—B6VæE&—fFU&WÇ•Fô6öÖÖVçB†6öÖÖVçD–BÂf—†VD×6rÂ66W75Fö¶VâÂV–6µ&WÆ–W2ÂvRæ–ç7Fw&Ô–B“² ¢“° ¦g2çw&—FTf–ÆU7–æ2‡F‚Â2ÂwWFc‚r“°¦6öç6öÆRæÆör‚u5T44U55ôäôDUõD4‚r“°