export function voiceGreeting(name:string,lang:string){
  return lang.startsWith('en')?`Hi, I'm ${name}. What would you like to explore about this project?`:`你好，我是 ${name}。我们接着聊这个项目，你现在最想弄清楚什么？`;
}
