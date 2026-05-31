// Highlight draw: animated yellow highlight behind text
function highlightDraw(tl, element, at, duration, color) {
  var highlight = document.createElement('span');
  highlight.style.cssText = 'position:absolute;bottom:0;left:0;height:35%;background:' + (color || 'rgba(167,139,250,0.3)') + ';width:0;z-index:-1;border-radius:2px;';
  element.style.position = 'relative';
  element.appendChild(highlight);
  tl.to(highlight, { width: '100%', duration: duration || 0.5, ease: 'power2.out' }, at);
}

// Circle annotation: draw a hand-drawn circle around text
function circleAnnotation(tl, element, at, duration, color) {
  var rect = element.getBoundingClientRect();
  var parentRect = element.offsetParent ? element.offsetParent.getBoundingClientRect() : rect;
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var padX = 16;
  var padY = 12;
  var w = rect.width + padX * 2;
  var h = rect.height + padY * 2;

  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.style.cssText = 'position:absolute;top:' + (rect.top - parentRect.top - padY) + 'px;left:' + (rect.left - parentRect.left - padX) + 'px;pointer-events:none;overflow:visible;z-index:10;';

  var ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  ellipse.setAttribute('cx', w / 2);
  ellipse.setAttribute('cy', h / 2);
  ellipse.setAttribute('rx', w / 2 - 4);
  ellipse.setAttribute('ry', h / 2 - 4);
  ellipse.setAttribute('fill', 'none');
  ellipse.setAttribute('stroke', color || 'var(--mp-color-accent, #a78bfa)');
  ellipse.setAttribute('stroke-width', '2.5');
  ellipse.setAttribute('stroke-linecap', 'round');

  var circumference = Math.PI * (w / 2 + h / 2 - 8);
  ellipse.setAttribute('stroke-dasharray', circumference);
  ellipse.setAttribute('stroke-dashoffset', circumference);

  svg.appendChild(ellipse);
  if (element.offsetParent) {
    element.offsetParent.style.position = element.offsetParent.style.position || 'relative';
    element.offsetParent.appendChild(svg);
  } else {
    element.style.position = 'relative';
    element.appendChild(svg);
  }

  tl.to(ellipse, { attr: { 'stroke-dashoffset': 0 }, duration: duration || 0.6, ease: 'power2.inOut' }, at);
}

// Underline draw: animated underline
function underlineDraw(tl, element, at, duration, color) {
  var line = document.createElement('span');
  line.style.cssText = 'position:absolute;bottom:-4px;left:0;height:3px;background:' + (color || 'var(--mp-color-accent, #a78bfa)') + ';width:0;border-radius:2px;';
  element.style.position = 'relative';
  element.appendChild(line);
  tl.to(line, { width: '100%', duration: duration || 0.4, ease: 'power2.out' }, at);
}
