export const Events = Object.freeze({
  PLUGIN_CALLBACK_RECEIVED: 'plugin:callback:received',
  PLUGIN_BIND_EMAIL_RECEIVED: 'plugin:bind-email:received',
  PLUGIN_SKIN_REFRESH_RECEIVED: 'plugin:skin-refresh:received',

  AUTH_VERIFY_COMPLETED: 'auth:verify:completed',
  AUTH_VERIFY_FAILED: 'auth:verify:failed',
  AUTH_LOGIN_SUCCESS: 'auth:login:success',
  SECURITY_ALERT_RAISED: 'security:alert:raised',
  USER_BIND_EMAIL_COMPLETED: 'user:bind-email:completed',
  SKIN_REFRESH_REQUESTED: 'skin:refresh:requested',

  VLA_COMMAND_KICK_ONLINE: 'vla:command:kick-online',
  VLA_COMMAND_BAN: 'vla:command:ban',
  VLA_COMMAND_DELETE_USER: 'vla:command:delete-user',
  VLA_COMMAND_SKIN_REFRESH: 'vla:command:skin-refresh',
  VLA_COMMAND_LINK_EXTERNAL_USER: 'vla:command:link-external-user',
  VLA_COMMAND_RESET_PASSWORD: 'vla:command:reset-password',
  VLA_COMMAND_BIND_EMAIL: 'vla:command:bind-email',
  VLA_COMMAND_UNBIND_DEVICE: 'vla:command:unbind-device',
  VLA_COMMAND_NOTIFY_BIND_EMAIL: 'vla:command:notify-bind-email',

  VLA_COMMAND_COMPLETED: 'vla:command:completed',
  VLA_COMMAND_FAILED: 'vla:command:failed',
  EVENT_HANDLER_FAILED: 'event:handler:failed',
})
