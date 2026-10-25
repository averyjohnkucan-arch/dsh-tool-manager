const bashContract = 'Bash requires BOTH description and command in the SAME call. description is a short label; command is the actual shell script. Example: {"description":"Show current directory","command":"pwd"}. To inspect another tool, call that tool directly using its schema; Bash is not a tool-menu launcher.';

export function guideTool(tool) {
 const parameters=tool.parameters;
 if(tool.name!=='bash'||!['description','command'].every(key=>parameters?.properties?.[key]&&parameters.required?.includes(key)))return tool;
 const properties={...parameters.properties};
 for(const key of ['description','command']){
  const original=properties[key];
  properties[key]={...original,description:`${key} (required): ${String(original.description||'').replace(new RegExp(`^${key} \\(required\\): `),'')}`};
 }
 return {...tool,description:tool.description?.startsWith(bashContract)?tool.description:bashContract+'\n'+(tool.description||''),parameters:{...parameters,properties}};
}

export function explainInvalidBash(exec,result) {
 if(exec.name!=='bash'||!result.isError||result.error?.info?.code!=='INVALID_ARGS')return result;
 return {...result,content:[...result.content,{type:'text',text:bashContract+' Resubmit a complete call; nothing from this invalid call was executed.'}]};
}

// Only describe affordances that exist in the registered schema. Never invent
// commands, inputs, or menus from catalog prose.
export function toolInputs(schema) {
 const p=schema?.parameters;
 if(!p)return {};
 const actions=p.properties?.action?.enum;
 return {required:p.required||[],...(Array.isArray(actions)?{actions}:{}),
  ...(actions?.includes('menu')&&!(p.required||[]).some(key=>key!=='action')?{menuCall:{name:schema.name,arguments:{action:'menu'}}}:{})};
}
