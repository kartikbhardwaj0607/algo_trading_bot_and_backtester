/**
 * Market Hours Utility — checks if NSE/BSE is currently open.
 * Market hours: Monday–Friday, 9:15 AM to 3:30 PM IST.
 * Uses Intl.DateTimeFormat to correctly convert UTC → IST without external packages.
 */

/**
 * Returns the current time parts in IST timezone.
 * @returns {{ day: number, hours: number, minutes: number }}
 */
const getISTTimeParts = () => {
  const now = new Date();

  // Use Intl to get IST parts
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;

  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

  return {
    day: weekdayMap[get('weekday')] ?? -1,
    hours: parseInt(get('hour'), 10),
    minutes: parseInt(get('minute'), 10),
  };
};

/**
 * Checks whether the Indian stock market (NSE/BSE) is currently open.
 * @returns {boolean} true if market is open, false otherwise.
 */
const isMarketOpen = () => {
  const { day, hours, minutes } = getISTTimeParts();

  // Monday = 1, Friday = 5
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) return false;

  // Convert current IST time to total minutes for easy comparison
  const totalMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 15;   // 9:15 AM = 555 minutes
  const marketClose = 15 * 60 + 30; // 3:30 PM = 930 minutes

  return totalMinutes >= marketOpen && totalMinutes < marketClose;
};

/**
 * Returns the current IST time as a formatted string for logging.
 * @returns {string}
 */
const getISTTimeString = () => {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'short',
    timeStyle: 'medium',
  });
};

module.exports = { isMarketOpen, getISTTimeString, getISTTimeParts };
