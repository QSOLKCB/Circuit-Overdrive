// SPDX-License-Identifier: Apache-2.0
// Presentation choices belong to the scene and never enter the race recipe.
export function validateEnvironment(value) {
  if (value !== 'day' && value !== 'night') throw RangeError('Unknown racing environment');
  return value;
}

export function courseEnvironment(course, requested) {
  const environment = validateEnvironment(requested);
  return course.id === 'skyway' || course.discipline === 'rocket' ? 'day' : environment;
}

export function eventTitle(course, environment) {
  if (courseEnvironment(course, environment) === 'day') return course.name;
  return course.closed ? 'Nightshift Speedway' : 'Redline Ridge — Midnight Descent';
}

export function nightFrame(course) {
  return course.closed ? {
    ambient:.23, sunDirection:[-.30,.45,-.77], sunColor:[.12,.17,.30],
    skyTop:[.012,.024,.086], skyBottom:[.153,.108,.246], fogColor:[.109,.106,.19],
    fogDensity:.00105, near:.13, far:1650
  } : {
    ambient:.19, sunDirection:[.46,.49,-.67], sunColor:[.13,.19,.30],
    skyTop:[.008,.022,.06], skyBottom:[.088,.139,.214], fogColor:[.074,.118,.178],
    fogDensity:.00075, near:.13, far:1650
  };
}
