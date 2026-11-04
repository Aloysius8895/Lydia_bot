import {parse,Kind,visit} from 'graphql';

/** Accept only an observed public GraphQL query, never form submissions, mutations or subscriptions. */
export function readOnlyGraphQL(body:string|null){
 if(!body||Buffer.byteLength(body)>200000)return false;
 try{
  const input=JSON.parse(body);if(!input||Array.isArray(input)||typeof input.query!=='string')return false;
  const containsSecrets=(v:unknown):boolean=>!!v&&typeof v==='object'&&Object.entries(v).some(([key,value])=>/token|password|secret|api.?key|authorization|cookie/i.test(key)||containsSecrets(value));
  if(containsSecrets(input.variables))return false;
  const ast=parse(input.query,{maxTokens:10000});let count=0,secretArgument=false;
  visit(ast,{Argument(node){if(/token|password|secret|api.?key|authorization|cookie/i.test(node.name.value))secretArgument=true;},ObjectField(node){if(/token|password|secret|api.?key|authorization|cookie/i.test(node.name.value))secretArgument=true;}});
  if(secretArgument)return false;
  for(const definition of ast.definitions){if(definition.kind===Kind.OPERATION_DEFINITION){if(definition.operation!=='query')return false;count++;}else if(definition.kind!==Kind.FRAGMENT_DEFINITION)return false;}
  return count>0;
 }catch{return false;}
}
