# 19: Simulation

**What to build:** The Director starts a Simulation from a chosen date at a chosen speed; the Reference Date moves forward one day every N seconds with a recalculation on each step, so Alerts and indicators change live. Every User sees a "SIMULATION — date" banner. The Director can pause or stop it; stopping restores the previous Reference Date.

**Blocked by:** 18 (Configuration and Threshold Overrides)

**Status:** ready-for-agent

- [ ] Start (start date, speed), pause and stop; Director only
- [ ] Each step advances the Reference Date by 1 day and recalculates, up to the end of the data
- [ ] Stop restores the previous Reference Date
- [ ] Banner visible to every User while a Simulation is running
- [ ] Reminders keep running on real time, independent of the Simulation clock
- [ ] API tests using the injectable clock
