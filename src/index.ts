import { DataManager } from './DataManager';
import { MapManager } from './MapManager';
import { AnimationManager } from './AnimationManager';
import { UIController } from './UIController';
import { formatDate } from './utils';

async function bootstrap() {
  console.log('Bootstrapping hamburgriders...');
  const dataManager = new DataManager();
  const mapManager = new MapManager(dataManager);
  
  let uiController: UIController;
  
  const animManager = new AnimationManager(dataManager, (time, vehicles, activeCount) => {
    // Update HUD
    if (uiController) {
      uiController.updateHUD(time, activeCount, 0);
      
      // Update Map
      const { routeVisible, typeVisible, busTypeVisible } = uiController.getLayerVisibility();
      mapManager.updateDeckLayers(time, routeVisible, typeVisible, busTypeVisible, vehicles);
    }
  });

  uiController = new UIController(dataManager, animManager, (routeVisible, typeVisible, busTypeVisible) => {
    // Force a map update when visibility changes
    // Need to trigger a new computation or just wait for next frame
  });

  // 1. Initial UI setup
  uiController.initUI();

  // 2. Load Data
  await dataManager.loadData();

  // 3. Update UI with metadata
  if (dataManager.meta) {
    document.getElementById('date-label')!.textContent = dataManager.meta.dateLabel;
    document.title = `${dataManager.meta.title} — ${dataManager.meta.dateLabel}`;
    document.getElementById('stat-total')!.textContent = dataManager.meta.stats.totalTrips.toString();

    const f = dataManager.meta.feed;
    document.getElementById('about-feed')!.innerHTML =
      `<strong>${f.publisher}</strong>${f.version ? ` (v${f.version})` : ''}<br>` +
      `Coverage: ${formatDate(f.startDate)} – ${formatDate(f.endDate)}<br>` +
      (f.url ? `<a href="${f.url}" target="_blank" rel="noopener">${f.url}</a>` : '');
  }

  // 4. Build Legend and Toggles
  uiController.buildLegend();
  uiController.buildTypeToggles();

  // 5. Init Map and Start Animation
  console.log('Initializing map...');
  await mapManager.initMap();
  console.log('Map initialized successfully.');
  animManager.start();
}

bootstrap().catch(err => {
  console.error('Failed to bootstrap hamburgriders:', err);
});
