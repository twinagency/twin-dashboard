(() => {
  'use strict';
  const model = globalThis.MoxyEarnings;
  if (!document.querySelector('.moxy-earnings') || !model) return;
  const find = id => document.getElementById(id);
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const fields = { audience: find('social-followers'), income: find('of-income'), fans: find('of-fans') };
  const configs = [
    { input: fields.audience, range: find('social-slider'), points: model.scales.social, unit: 'followers' },
    { input: fields.income, range: find('of-income-slider'), points: model.scales.income, unit: 'US dollars per month' },
    { input: fields.fans, range: find('of-fans-slider'), points: model.scales.fans, unit: 'total subscribers' }
  ];
  const value = input => Math.round(model.clamp(input.value.replaceAll(',', '').trim(), 100000000));
  function update() {
    const values = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, value(input)]));
    const result = model.estimate(values);
    const output = find('estimate-value');
    const display = result.revenue >= 1000000 ? compact.format(result.revenue) : money.format(result.revenue);
    output.textContent = display;
    output.dataset.length = display.length > 6 ? 'long' : 'short';
    output.title = 'Estimated monthly AI revenue: US$' + money.format(result.revenue);
    output.setAttribute('aria-label', 'Estimated monthly AI revenue: US$' + money.format(result.revenue) + '. This is an estimate only.');
    const comparison = find('income-comparison');
    comparison.hidden = result.incomeRatio === null;
    comparison.textContent = result.incomeRatio === null ? '' : 'Equivalent to ' + money.format(result.incomeRatio) + '% of your current monthly income.';

    for (const item of configs) {
      item.range.value = String(model.toSlider(value(item.input), item.points));
      item.range.style.setProperty('--fill', Number(item.range.value) / 9 + '%');
      item.range.setAttribute('aria-valuetext', number.format(value(item.input)) + ' ' + item.unit);
      item.input.dataset.length = item.input.value.length > 8 ? 'long' : 'short';
    }
  }
  for (const item of configs) {
    item.input.addEventListener('input', update);
    item.input.addEventListener('change', () => { item.input.value = number.format(value(item.input)); update(); });
    item.range.addEventListener('input', () => { item.input.value = number.format(model.fromSlider(item.range.value, item.points)); update(); });
  }
  update();
})();
