import { EventEmitter } from 'events';

export const syncEmitter = new EventEmitter();
syncEmitter.setMaxListeners(50); // allow concurrent watchers across many repos
