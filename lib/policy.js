// Names supplied by the shipped standard preset in DSH 0.2.1-rc.2.
// pwsh replaces bash on Windows; working_directory is contributed by the host.
export const STOCK_TOOLS=new Set([
 'bash','pwsh','read','read_image','write','edit','glob','grep','working_directory',
 'job_list','job_output','job_kill','schedule_create','schedule_list','schedule_update','schedule_delete',
 'skill','create_goal','get_goal','update_goal','exit_plan_mode',
 'subagent','subagent_fork','list_agents','send_message','interrupt_agent','workflow',
 'ask_user_question','todo_write','web_search','web_fetch','present',
]);
// General runtime and coordination capabilities stay at the top level.
// Specialized generators and integrations continue to require discovery.
export const ESSENTIAL_TOOLS=new Set([...STOCK_TOOLS,
 'enter_plan_mode','knowledge_add_document','knowledge_create_base','knowledge_delete_base',
 'knowledge_delete_document','knowledge_get_document','knowledge_import_url',
 'knowledge_list_bases','knowledge_list_documents','knowledge_read_document',
 'knowledge_read_evidence','knowledge_refresh_url','knowledge_reindex_base',
 'knowledge_reindex_document','knowledge_search','knowledge_stats','ninfer_models',
]);
export function isSystemTool(name){return ESSENTIAL_TOOLS.has(name)||name.startsWith('knowledge_');}
export function defaultMode(name,settings){if(settings.defaultMode==='essential')return isSystemTool(name)?'basic':'discover';return (settings.defaultMode==='discover'||(settings.defaultMode==='stock'&&!STOCK_TOOLS.has(name)))?'discover':'inherit';}
