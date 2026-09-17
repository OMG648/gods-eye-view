import * as Cesium from 'cesium';
import { mobilePerformanceProfile } from '../mobileProfile.js';

/** Create the standard globe viewer in caller-owned, visible containers. */
export function createApplicationViewer({
  container,
  creditContainer,
  profile = mobilePerformanceProfile(),
}) {
  if (!container || !creditContainer)
    throw new TypeError('Viewer and credit containers are required');
  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    selectionIndicator: false,
    infoBox: false,
    baseLayer: false,
    creditContainer,
    // 4x MSAA is the most expensive single default on a phone GPU, and the
    // one a mobile device is least able to absorb. Desktop keeps it.
    msaaSamples: profile.msaaSamples,
    contextOptions: { webgl: { preserveDrawingBuffer: true } },
  });
  try {
    viewer.targetFrameRate = 60;
    // Never draw more pixels than there are CSS pixels. This is already
    // Cesium's default; pinning it keeps a preset or a restored share link
    // from raising it on hardware that cannot afford the fill rate.
    viewer.resolutionScale = profile.resolutionScale;
    viewer.useBrowserRecommendedResolution = true;
    viewer.scene.globe.show = false;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.atmosphereLightIntensity = 18;
    viewer.scene.skyAtmosphere.saturationShift = -0.12;
    viewer.scene.skyAtmosphere.brightnessShift = -0.08;
    return viewer;
  } catch (error) {
    viewer.destroy();
    throw error;
  }
}
