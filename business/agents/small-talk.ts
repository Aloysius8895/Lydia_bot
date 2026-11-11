// Greetings, thanks and "who are you": converse.ts must answer these directly (never start research).
const SMALL_TALK=/^(?:(?:请|麻烦|那)?(?:你|您)?(?:可以|能|能不能|可不可以|先)?\s*)?(?:你好|您好|你好呀|你好啊|嗨|哈喽|哈啰|嘿|hello|hi|hey|yo|在吗|在不在|早上好|上午好|中午好|下午好|晚上好|早安|午安|晚安|早|谢谢|谢谢你|多谢|感谢|辛苦了|thanks?|thank you|thx|ok|okay|好的|好|好哒|嗯|嗯嗯|收到|明白|明白了|了解|知道了|拜拜|再见|bye|你是谁|你是谁呀|介绍(?:一下)?(?:你|您)?自己|自我介绍(?:一下)?|你能做什么|你可以做什么|你会什么|(?:can|could) (?:you|u) (?:please )?introduce (?:yourself|urself)|introduce yourself|who are (?:you|u)|what can (?:you|u) do)(?:[\s,，]*(?:steve|lydia|老师|呀|啊|哦|喔|吗|呢|哈))*[\s!！。.~～？?,，]*$/i;
export function isSmallTalk(message:string){
  const text=String(message).trim();
  return text.length>0&&text.length<=40&&SMALL_TALK.test(text);
}
