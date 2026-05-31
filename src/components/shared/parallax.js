// Create parallax depth layers
// Elements at different z-depths move at different speeds during camera movement
function createParallaxLayers(container, layers) {
  // layers: [{ selector, depth }] where depth 0=background, 1=foreground
  // Wraps each layer in a container with will-change: transform
  var result = [];
  layers.forEach(function(layer) {
    var elements = container.querySelectorAll(layer.selector);
    elements.forEach(function(el) {
      el.style.willChange = 'transform';
      result.push({ el: el, depth: layer.depth });
    });
  });
  return result;
}

function animateParallax(tl, layers, direction, distance, duration, at) {
  // Animate layers at different speeds based on depth
  // depth 0 moves slowest, depth 1 moves fastest
  var startAt = at || 0;
  layers.forEach(function(layer) {
    var speed = 0.3 + layer.depth * 0.7; // 0.3x to 1.0x speed based on depth
    var move = distance * speed;
    var props = { duration: duration || 1, ease: 'power2.inOut' };

    if (direction === 'x' || direction === 'left' || direction === 'right') {
      props.x = direction === 'left' ? -move : move;
    } else {
      props.y = direction === 'up' ? -move : move;
    }

    tl.to(layer.el, props, startAt);
  });
}
