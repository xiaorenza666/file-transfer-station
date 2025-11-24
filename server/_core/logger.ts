import fs from 'fs';
import path from 'path';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

class Logger {
  private logFile: string;

  constructor() {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logFile = path.join(logDir, 'app.log');
  }

  private formatMessage(level: LogLevel, message: string, context?: string) {
    const timestamp = new Date().toISOString();
    const contextStr = context ? `[${context}]` : '';
    return `${timestamp} [${level}] ${contextStr} ${message}`;
  }

  private writeToFile(message: string) {
    fs.appendFile(this.logFile, message + '\n', (err) => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
  }

  debug(message: string, context?: string, ...args: any[]) {
    if (process.env.NODE_ENV === 'development') {
      const formatted = this.formatMessage(LogLevel.DEBUG, message, context);
      console.debug(formatted, ...args);
      this.writeToFile(formatted + (args.length ? ' ' + JSON.stringify(args) : ''));
    }
  }

  info(message: string, context?: string, ...args: any[]) {
    const formatted = this.formatMessage(LogLevel.INFO, message, context);
    console.info(formatted, ...args);
    this.writeToFile(formatted + (args.length ? ' ' + JSON.stringify(args) : ''));
  }

  warn(message: string, context?: string, ...args: any[]) {
    const formatted = this.formatMessage(LogLevel.WARN, message, context);
    console.warn(formatted, ...args);
    this.writeToFile(formatted + (args.length ? ' ' + JSON.stringify(args) : ''));
  }

  error(message: string, context?: string, ...args: any[]) {
    const formatted = this.formatMessage(LogLevel.ERROR, message, context);
    console.error(formatted, ...args);
    this.writeToFile(formatted + (args.length ? ' ' + JSON.stringify(args) : ''));
  }
}

export const logger = new Logger();
