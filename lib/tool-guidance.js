const bashContract = 'Include both required fields: description (a short label) and command (the shell script).';

export function guideTool(tool) {
 const parameters=tool.parameters;
 if(tool.name!=='bash'||!['description','command'].every(key=>parameters?.properties?.[key]&&parameters.required?.includes(key)))return tool;
 if(tool.description?.includes(bashContract))return tool;
 return {...tool,description:(tool.description||'')+' '+bashContract};
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
