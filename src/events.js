const EventEmitter = require('events');
const telemetryEvents = new EventEmitter();
telemetryEvents.setMaxListeners(100);

module.exports = telemetryEvents;
