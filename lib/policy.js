// Names supplied by the shipped standard preset in DSH 0.2.1-rc.2.
// pwsh replaces bash on Windows; working_directory is contributed by the host.
export const STOCK_TOOLS=new Set([
 'bash','pwsh','read','read_image','write','edit','glob','grep','working_directory',
 'job_list','job_output','job_kill','schedule_create','schedule_list','schedule_update','schedule_delete',
 'skill','create_goal','get_goal','update_goal','exit_plan_mode',
 'subagent','subagent_fork','list_agents','send_message','interrupt_agent','workflow',
 'ask_user_question','todo_write','web_search','web_fetch','present',
]);
export const ESSENTIAL_TOOLS=new Set(['bash','pwsh','read','write','edit','glob','grep','read_image','working_directory','ask_user_question','web_search','web_fetch','knowledge_search','knowledge_read_document','skill']);
export function defaultMode(name,settings){if(settings.defaultMode==='essential')return ESSENTIAL_TOOLS.has(name)?'basic':'discover';return (settings.defaultMode==='discover'||(settings.defaultMode==='stock'&&!STOCK_TOOLS.has(name)))?'discover':'inherit';}
