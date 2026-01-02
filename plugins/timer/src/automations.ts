/**
 * Example Automations using the Timer Plugin
 *
 * These show how to use the automation system with real events.
 */

import { automation } from "@elia/sdk";

/**
 * Simple: Log when any timer completes
 */
export const logTimerComplete = automation("log-timer-complete")
  .name("Log Timer Completion")
  .description("Logs a message whenever any timer completes")
  .on("timer.completed")
  .log("info", (ctx) => `Timer "${ctx.payload.name}" completed after ${ctx.payload.duration}ms`)
  .build();

/**
 * Branching: Different actions based on timer name
 */
export const timerActions = automation("timer-actions")
  .name("Timer-based Actions")
  .description("Perform different actions based on which timer completed")
  .on("timer.completed")
  .switch((ctx) => ctx.payload.name as string, {
    "morning-alarm": (b) =>
      b
        .parallel(
          (sub) => sub.action("lights.on", { room: "bedroom", brightness: 50 }),
          (sub) => sub.action("coffee.start"),
        )
        .delay("10s")
        .action("lights.on", { room: "bedroom", brightness: 100 }),

    "sleep-timer": (b) => b.action("lights.off", { room: "bedroom" }).action("tv.off"),

    default: (b) => b.log("info", (ctx) => `Timer "${ctx.payload.name}" completed - no action defined`),
  })
  .build();

/**
 * Async: Wait for follow-up events
 */
export const reminderFlow = automation("reminder-flow")
  .name("Reminder with Snooze")
  .description("Show reminder, wait for snooze or dismiss")
  .on("timer.completed")
  .when((ctx) => (ctx.payload.name as string).startsWith("reminder:"))
  .emit("notification.show", (ctx) => ({
    title: "Reminder",
    message: (ctx.payload.name as string).replace("reminder:", ""),
    actions: ["snooze", "dismiss"],
  }))
  .waitFor("notification.action", {
    timeout: "5m",
    condition: (ctx) => ctx.payload.action === "snooze",
    onTimeout: (b) => b.log("info", "Reminder ignored"),
  })
  .if(
    (ctx) => ctx.lastResult === "snooze",
    (b) =>
      b
        .action("timer.set", { name: (ctx) => ctx.payload.name, seconds: 300 })
        .log("info", "Reminder snoozed for 5 minutes"),
  )
  .build();

/**
 * State tracking: Count consecutive timers
 */
export const timerCounter = automation("timer-counter")
  .name("Timer Counter")
  .description("Count how many timers have fired, emit event every 5")
  .on("timer.completed")
  .set("count", (ctx) => ((ctx.state.count as number) ?? 0) + 1)
  .log("debug", (ctx) => `Timer count: ${ctx.state.count}`)
  .if(
    (ctx) => (ctx.state.count as number) % 5 === 0,
    (b) =>
      b
        .emit("timer.milestone", (ctx) => ({ count: ctx.state.count }))
        .log("info", (ctx) => `🎉 Milestone: ${ctx.state.count} timers completed!`),
  )
  .build();

/**
 * Loop: Process multiple rooms
 */
export const nightMode = automation("night-mode")
  .name("Night Mode")
  .description("Turn off all lights when sleep timer fires")
  .on("timer.completed")
  .when((ctx) => ctx.payload.name === "bedtime")
  .set("rooms", ["living", "kitchen", "bedroom", "bathroom"])
  .forEach(
    (ctx) => ctx.state.rooms as string[],
    "room",
    (b) => b.action("lights.off", (ctx) => ({ room: ctx.state.room })).delay("500ms"), // Stagger to avoid power surge
  )
  .emit("home.night-mode", { enabled: true })
  .log("info", "Night mode activated")
  .build();

/**
 * Error handling: Graceful failure
 */
export const robustAutomation = automation("robust-example")
  .name("Robust Automation")
  .description("Shows error handling")
  .on("timer.completed")
  .when((ctx) => ctx.payload.name === "test-robust")
  .action("potentially.failing.action")
  .onError((b) =>
    b
      .log("error", (ctx) => `Automation failed: ${ctx.lastResult}`)
      .emit("automation.error", (ctx) => ({
        automation: "robust-example",
        error: ctx.lastResult,
      })),
  )
  .build();

