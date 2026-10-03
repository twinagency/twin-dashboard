(function (root) {
  'use strict';
  // Optimistic planning assumptions selected for this calculator, not measured averages.
  // 100,000 social followers → 3,000 joins → 300 buyers × US$50 = US$15,000.
  const assumptions = Object.freeze({ socialJoin: 3, subscriberJoin: 15, pay: 10, spend: 50 });
  const scales = Object.freeze({
    social: [0, 10000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000],
    income: [0, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000],
    fans: [0, 100, 500, 1000, 5000, 10000, 25000, 50000, 100000, 250000]
  });
  function clamp(value, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
  }
  function calculate(values) {
    const audience = Math.round(clamp(values.audience, 100000000));
    const joining = audience * clamp(values.join, 100) / 100;
    const paying = joining * clamp(values.pay, 100) / 100;
    const spend = clamp(values.spend, 100000000);
    return { audience, joining, paying, spend, revenue: paying * spend };
  }
  function estimate(values) {
    const audience = Math.round(clamp(values.audience, 100000000));
    const subscribers = Math.round(clamp(values.fans, 100000000));
    const income = clamp(values.income, 100000000);
    const socialJoining = audience * assumptions.socialJoin / 100;
    const subscriberJoining = subscribers * assumptions.subscriberJoin / 100;
    // Treat social and platform audiences as alternative acquisition routes.
    // Do not add them together: the same people may be in both groups.
    const joining = Math.max(socialJoining, subscriberJoining);
    const paying = joining * assumptions.pay / 100;
    const revenue = paying * assumptions.spend;
    // Existing income is comparison context, not a multiplier on projected sales.
    return { audience, subscribers, joining, paying, spend: assumptions.spend,
      revenue, income, incomeRatio: income > 0 ? revenue / income * 100 : null };
  }
  function fromSlider(value, points) {
    const position = clamp(value, 900) / 100;
    const i = Math.min(8, Math.floor(position));
    return Math.round(points[i] + (points[i + 1] - points[i]) * (position - i));
  }
  function toSlider(value, points) {
    const n = clamp(value, points[9]);
    const i = Math.max(0, points.findIndex((p, index) => index < 9 && n <= points[index + 1]));
    return (i + (n - points[i]) / (points[i + 1] - points[i])) * 100;
  }
  root.MoxyEarnings = Object.freeze({ assumptions, scales, clamp, calculate, estimate, fromSlider, toSlider });
})(globalThis);
