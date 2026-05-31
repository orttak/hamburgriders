import { DataManager } from './DataManager';
import { AnimationManager } from './AnimationManager';
import { BUS_TYPE_CONFIG, BUS_TYPE_ORDER, TYPE_ORDER, TRANSIT_CONFIG, VEHICLE_TYPE_COLORS } from './constants';
import { secToGTFSTime } from './utils';
import type { Route } from './types';

interface DisplayRoute {
  ids: string[];
  short_name: string;
  long_name: string;
  color: string;
  transit_type: string;
  bus_type?: string | undefined;
  tripCount: number;
}

export class UIController {
  private dataManager: DataManager;
  private animManager: AnimationManager;
  private onTypeLayerUpdate: (routeVisible: Record<string, boolean>, typeVisible: Record<string, boolean>, busTypeVisible: Record<string, boolean>) => void;

  constructor(
    dataManager: DataManager, 
    animManager: AnimationManager,
    onTypeLayerUpdate: (routeVisible: Record<string, boolean>, typeVisible: Record<string, boolean>, busTypeVisible: Record<string, boolean>) => void
  ) {
    this.dataManager = dataManager;
    this.animManager = animManager;
    this.onTypeLayerUpdate = onTypeLayerUpdate;
  }

  initUI() {
    // Play / pause
    const playPauseBtn = document.getElementById('play-pause') as HTMLButtonElement;
    playPauseBtn.addEventListener('click', () => {
      this.animManager.playing = !this.animManager.playing;
      this.animManager.resetLastTs();
      playPauseBtn.textContent = this.animManager.playing ? '⏸ Pause' : '▶ Play';
    });

    // Timeline scrubber
    const slider = document.getElementById('timeline-slider') as HTMLInputElement;
    slider.addEventListener('input', (e) => {
      const newTime = parseFloat((e.target as HTMLInputElement).value);
      this.animManager.animTime = newTime;
      this.animManager.resetLastTs();
    });

    // Speed selector
    const speedSelect = document.getElementById('speed-select') as HTMLSelectElement;
    speedSelect.addEventListener('change', (e) => {
      this.animManager.speed = parseFloat((e.target as HTMLSelectElement).value);
    });

    // Legend toggle
    const legendPanel = document.getElementById('legend')!;
    const legendBtn   = document.getElementById('legend-btn')!;
    legendBtn.addEventListener('click', () => {
      legendPanel.classList.toggle('visible');
      legendBtn.classList.toggle('active');
    });

    // About modal
    const overlay = document.getElementById('modal-overlay')!;
    document.getElementById('about-btn')!.addEventListener('click', () => overlay.classList.add('visible'));
    document.getElementById('modal-close')!.addEventListener('click', () => overlay.classList.remove('visible'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('visible'); });

    this.initMobileLayersPanel();
    this.initMobileStatsPanel();
  }

  updateHUD(time: number, activeCount: number, seenCount: number) {
    (document.getElementById('timeline-slider') as HTMLInputElement).value = time.toString();
    document.getElementById('time-display')!.textContent = secToGTFSTime(time);
    document.getElementById('stat-active')!.textContent = activeCount.toString();
    document.getElementById('stat-cumulative')!.textContent = seenCount.toString();
  }

  buildLegend() {
    const container = document.getElementById('legend-items')!;
    container.innerHTML = '';

    TYPE_ORDER.forEach(type => {
      const cfg = TRANSIT_CONFIG[type];
      if (!cfg) return;
      const stops = this.dataManager.getTransitStops(type);
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML =
        `<span class="legend-swatch" style="background:${cfg.hex};opacity:0.4"></span>` +
        `<span class="legend-route-name">${type} stops <small style="color:#666">(${stops.length})</small></span>`;
      container.appendChild(item);
    });

    const sortedRoutes = this.getDisplayRoutes(Object.values(this.dataManager.routes));

    for (const r of sortedRoutes) {
      const shortLabel = r.short_name || r.ids[0] || '';
      const longLabel  = r.long_name || '';
      const truncated  = longLabel.length > 28 ? longLabel.substring(0, 28) + '…' : longLabel;

      const item = document.createElement('div');
      item.className = 'legend-item';
      item.title = longLabel || shortLabel;
      item.innerHTML =
        `<span class="legend-swatch" style="background:#${r.color || '4a90d9'}"></span>` +
        `<span class="legend-route-name"><strong>${shortLabel}</strong>` +
        (truncated ? ` <small style="color:#666">${truncated}</small>` : '') +
        `</span>`;
      container.appendChild(item);
    }
  }

  buildTypeToggles() {
    const container = document.getElementById('layers-body')!;
    container.innerHTML = '';

    const ROUTED_TYPES = ['S-Bahn', 'U-Bahn', 'Regional'];
    const BUS_ROUTES = Object.values(this.dataManager.routes).filter(r => this.isBusRoute(r));
    const busTypeRoutes: Record<string, Route[]> = {};
    for (const busType of BUS_TYPE_ORDER) {
      busTypeRoutes[busType] = BUS_ROUTES.filter(r => this.getBusType(r) === busType);
    }
    const typeRoutes: Record<string, DisplayRoute[]> = {};
    for (const t of ROUTED_TYPES) {
      typeRoutes[t] = this.getDisplayRoutes(Object.values(this.dataManager.routes).filter(r => r.transit_type === t));
    }

    const groupIcons: Record<string, string> = { 
      'S-Bahn': '<span style="color:#50c878">●</span>', 
      'U-Bahn': '<span style="color:#E2001A">●</span>', 
      'Regional': '<span style="color:#F39100">●</span>', 
      'Bus': '<span style="color:#5b9bd5">●</span>' 
    };

    for (const type of TYPE_ORDER) {
      const group = document.createElement('div');
      group.className = window.matchMedia('(max-width: 700px)').matches
        ? 'layer-type-group collapsed'
        : 'layer-type-group';

      const header = document.createElement('div');
      header.className = 'layer-type-header';
      const icon = groupIcons[type] || '🚏';
      const isBus = type === 'Bus';
      const routeCount = isBus ? BUS_ROUTES.length : (typeRoutes[type]?.length || 0);
      header.innerHTML = `
        <input type="checkbox" class="layer-type-check" data-type="${type}" data-is-bus="${isBus}">
        <span class="layer-type-icon">${icon}</span>
        <span class="layer-type-name">${type}</span>
        <span class="layer-type-count">${routeCount}</span>
        <span class="layer-type-arrow">▼</span>
      `;
      group.appendChild(header);

      if (isBus) {
        const routesList = document.createElement('div');
        routesList.className = 'layer-type-routes';

        for (const busType of BUS_TYPE_ORDER) {
          const cfg = BUS_TYPE_CONFIG[busType]!;
          const item = document.createElement('label');
          item.className = 'layer-route-item layer-bus-type-item';
          item.title = cfg.description;
          item.innerHTML = `
            <input type="checkbox" class="layer-bus-type-check" data-bus-type="${busType}">
            <span class="layer-route-color layer-bus-type-icon" style="border-color:#${cfg.color};color:#${cfg.color}">${cfg.icon}</span>
            <span class="layer-route-name">${cfg.label}</span>
            <span class="layer-route-trips">${busTypeRoutes[busType]?.length || 0}</span>
          `;
          routesList.appendChild(item);
        }
        group.appendChild(routesList);
      } else {
        const typeRoutesList = typeRoutes[type];
        if (typeRoutesList && typeRoutesList.length > 0) {
          const routesList = document.createElement('div');
          routesList.className = 'layer-type-routes';

          const sorted = [...typeRoutesList].sort((a, b) => {
            return (a.short_name || '').localeCompare(b.short_name || '', undefined, { numeric: true });
          });

          for (const route of sorted) {
            const item = document.createElement('label');
            item.className = 'layer-route-item';
            item.innerHTML = `
              <input type="checkbox" class="layer-route-check" data-route-ids="${route.ids.join(',')}">
              <span class="layer-route-color" style="background:#${route.color || '4a90d9'}"></span>
              <span class="layer-route-name" title="${route.long_name || ''}">${route.short_name || route.ids[0]}</span>
              <span class="layer-route-trips">${route.tripCount}</span>
            `;
            routesList.appendChild(item);
          }
          group.appendChild(routesList);
        }
      }
      container.appendChild(group);
    }

    // --- Default: All transit infrastructure (Heatmap) is ON via MapManager. ---
    // --- Here we only control the VEHICLE (movement) toggles. ---
    const DEFAULT_VEHICLE_TYPES = ['S-Bahn', 'U-Bahn'];

    container.querySelectorAll('.layer-type-check').forEach(el => {
      const tc = el as HTMLInputElement;
      const type = tc.dataset.type!;
      // Bus vehicle movement is OFF by default
      if (type === 'Bus') {
        tc.checked = false;
      } else if (DEFAULT_VEHICLE_TYPES.includes(type)) {
        tc.checked = true;
      } else {
        tc.checked = false; // Regional vehicles OFF by default
      }
    });

    container.querySelectorAll('.layer-bus-type-check').forEach(el => {
      (el as HTMLInputElement).checked = false;
    });

    container.querySelectorAll('.layer-route-check').forEach(el => {
      const rc = el as HTMLInputElement;
      const route = this.getFirstRouteForInput(rc);
      if (route && DEFAULT_VEHICLE_TYPES.includes(route.transit_type)) {
        rc.checked = true; // S and U vehicle routes ON by default
      } else {
        rc.checked = false; // Regional vehicle routes OFF by default
      }
    });

    this.triggerLayerUpdate();

    container.querySelectorAll('.layer-type-check').forEach(el => {
      el.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const type = target.dataset.type!;
        const isBus = target.dataset.isBus === 'true';
        const isChecked = target.checked;

        if (!isBus) {
          container.querySelectorAll(`.layer-route-check`).forEach(rel => {
            const rc = rel as HTMLInputElement;
            const route = this.getFirstRouteForInput(rc);
            if (route && route.transit_type === type) {
              rc.checked = isChecked;
            }
          });
        } else {
          container.querySelectorAll('.layer-bus-type-check').forEach(rel => {
            (rel as HTMLInputElement).checked = isChecked;
          });
        }
        this.triggerLayerUpdate();
      });
    });

    container.querySelectorAll('.layer-route-check').forEach(el => {
      el.addEventListener('change', () => this.triggerLayerUpdate());
    });

    container.querySelectorAll('.layer-bus-type-check').forEach(el => {
      el.addEventListener('change', () => this.triggerLayerUpdate());
    });

    const allCheckbox = document.getElementById('layer-toggle-all') as HTMLInputElement;
    allCheckbox.addEventListener('change', (e) => {
      const allChecked = (e.target as HTMLInputElement).checked;
      container.querySelectorAll('.layer-route-check').forEach(rel => {
        (rel as HTMLInputElement).checked = allChecked;
      });
      container.querySelectorAll('.layer-bus-type-check').forEach(rel => {
        (rel as HTMLInputElement).checked = allChecked;
      });
      container.querySelectorAll('.layer-type-check').forEach(rel => {
        (rel as HTMLInputElement).checked = allChecked;
      });
      this.triggerLayerUpdate();
    });

    container.querySelectorAll('.layer-type-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        header.closest('.layer-type-group')!.classList.toggle('collapsed');
      });
    });
  }

  private triggerLayerUpdate() {
    const container = document.getElementById('layers-body')!;
    const routeChecks = container.querySelectorAll('.layer-route-check');
    const routeVisible: Record<string, boolean> = {};
    routeChecks.forEach(el => {
      const rc = el as HTMLInputElement;
      this.getRouteIdsForInput(rc).forEach(routeId => {
        routeVisible[routeId] = rc.checked;
      });
    });

    const typeVisible: Record<string, boolean> = {};
    const busTypeVisible = this.getBusTypeVisibility(container);
    TYPE_ORDER.forEach(type => {
      const tc = container.querySelector(`.layer-type-check[data-type="${type}"]`) as HTMLInputElement;
      if (tc && tc.dataset.isBus === 'true') {
        typeVisible[type] = Object.values(busTypeVisible).some(Boolean);
      } else {
        typeVisible[type] = false;
      }
    });

    for (const [rid, checked] of Object.entries(routeVisible)) {
      if (checked) {
        const route = this.dataManager.routes[rid];
        if (route) {
          const tt = route.transit_type;
          if (typeVisible[tt] !== undefined) typeVisible[tt] = true;
        }
      }
    }

    TYPE_ORDER.forEach(type => {
      const tc = container.querySelector(`.layer-type-check[data-type="${type}"]`) as HTMLInputElement;
      if (tc && tc.dataset.isBus !== 'true') {
        tc.checked = typeVisible[type] ?? false;
      }
    });

    const busHeader = container.querySelector('.layer-type-check[data-type="Bus"]') as HTMLInputElement;
    if (busHeader) busHeader.checked = typeVisible.Bus ?? false;

    const allChecks = container.querySelectorAll('.layer-route-check, .layer-bus-type-check');
    const allCheckbox = document.getElementById('layer-toggle-all') as HTMLInputElement;
    const checked = container.querySelectorAll('.layer-route-check:checked, .layer-bus-type-check:checked');
    allCheckbox.checked = checked.length === allChecks.length && allChecks.length > 0;

    this.onTypeLayerUpdate(routeVisible, typeVisible, busTypeVisible);
  }

  getLayerVisibility() {
    const container = document.getElementById('layers-body')!;
    const routeChecks = container.querySelectorAll('.layer-route-check');
    const routeVisible: Record<string, boolean> = {};
    routeChecks.forEach(el => {
      const rc = el as HTMLInputElement;
      this.getRouteIdsForInput(rc).forEach(routeId => {
        routeVisible[routeId] = rc.checked;
      });
    });

    const typeVisible: Record<string, boolean> = {};
    const busTypeVisible = this.getBusTypeVisibility(container);
    TYPE_ORDER.forEach(type => {
      const tc = container.querySelector(`.layer-type-check[data-type="${type}"]`) as HTMLInputElement;
      if (tc && tc.dataset.isBus === 'true') {
        typeVisible[type] = Object.values(busTypeVisible).some(Boolean);
      } else {
        typeVisible[type] = false;
      }
    });

    for (const [rid, checked] of Object.entries(routeVisible)) {
      if (checked) {
        const route = this.dataManager.routes[rid];
        if (route) {
          const tt = route.transit_type;
          if (typeVisible[tt] !== undefined) typeVisible[tt] = true;
        }
      }
    }
    return { routeVisible, typeVisible, busTypeVisible };
  }

  private getRouteTripCounts() {
    const routeTripCounts: Record<string, number> = {};
    for (const t of this.dataManager.trips) {
      routeTripCounts[t.route_id] = (routeTripCounts[t.route_id] || 0) + 1;
    }
    return routeTripCounts;
  }

  private getDisplayRoutes(routes: Route[]): DisplayRoute[] {
    const routeTripCounts = this.getRouteTripCounts();
    const grouped = new Map<string, DisplayRoute>();

    for (const route of routes) {
      const shortName = route.short_name || route.id;
      const key = `${route.transit_type}|${shortName}`;
      const tripCount = routeTripCounts[route.id] || 0;
      const existing = grouped.get(key);

      if (existing) {
        existing.ids.push(route.id);
        existing.tripCount += tripCount;
        if (!existing.long_name && route.long_name) existing.long_name = route.long_name;
        continue;
      }

      grouped.set(key, {
        ids: [route.id],
        short_name: shortName,
        long_name: route.long_name || '',
        color: this.getRouteColor(route),
        transit_type: route.transit_type,
        bus_type: route.bus_type,
        tripCount
      });
    }

    return [...grouped.values()].sort((a, b) =>
      (a.short_name || '').localeCompare(b.short_name || '', undefined, { numeric: true })
    );
  }

  private getRouteIdsForInput(input: HTMLInputElement) {
    return (input.dataset.routeIds || '').split(',').filter(Boolean);
  }

  private getFirstRouteForInput(input: HTMLInputElement) {
    const [routeId] = this.getRouteIdsForInput(input);
    return routeId ? this.dataManager.routes[routeId] : undefined;
  }

  private getBusTypeVisibility(container: HTMLElement) {
    const busTypeVisible: Record<string, boolean> = {};
    BUS_TYPE_ORDER.forEach(busType => {
      const input = container.querySelector(`.layer-bus-type-check[data-bus-type="${busType}"]`) as HTMLInputElement;
      busTypeVisible[busType] = !!input?.checked;
    });
    return busTypeVisible;
  }

  private isBusRoute(route: Route) {
    return !!route.bus_type || route.transit_type === 'Bus' || route.transit_type === 'Night';
  }

  private getBusType(route: Route) {
    if (route.bus_type === 'XpressBus' || route.bus_type === 'SchnellBus') return 'ExpressBus';
    return route.bus_type || 'StandardBus';
  }

  private getRouteColor(route: Route) {
    if (route.bus_type) return VEHICLE_TYPE_COLORS[this.getBusType(route)] || route.color || '4a90d9';
    return VEHICLE_TYPE_COLORS[route.transit_type] || route.color || '4a90d9';
  }

  private initMobileLayersPanel() {
    const panel = document.getElementById('layers-panel');
    const header = document.getElementById('layers-header');
    const toggle = document.getElementById('layers-toggle');
    if (!panel || !header || !toggle) return;

    const mobileQuery = window.matchMedia('(max-width: 700px)');

    const setCollapsed = (collapsed: boolean) => {
      if (!collapsed && mobileQuery.matches) this.collapseLayerGroups();
      panel.classList.toggle('mobile-collapsed', collapsed);
      toggle.textContent = collapsed ? '⌃' : '⌄';
      toggle.setAttribute('aria-expanded', (!collapsed).toString());
    };

    const syncForViewport = () => {
      if (mobileQuery.matches) {
        if (!panel.classList.contains('mobile-collapsed')) setCollapsed(true);
      } else {
        panel.classList.remove('mobile-collapsed');
        toggle.setAttribute('aria-expanded', 'true');
      }
    };

    const handleToggle = (e: Event) => {
      if (!mobileQuery.matches) return;
      const target = e.target as HTMLElement;
      if (target.closest('#layer-controls')) return;
      e.preventDefault();
      e.stopPropagation();
      setCollapsed(!panel.classList.contains('mobile-collapsed'));
    };

    header.addEventListener('click', handleToggle);
    toggle.addEventListener('touchend', handleToggle);

    syncForViewport();
    mobileQuery.addEventListener('change', syncForViewport);
  }

  private collapseLayerGroups() {
    document.querySelectorAll('#layers-body .layer-type-group').forEach(group => {
      group.classList.add('collapsed');
    });
  }

  private initMobileStatsPanel() {
    const panel = document.getElementById('stats');
    const heading = panel?.querySelector('h3');
    const toggle = document.getElementById('stats-toggle');
    if (!panel || !heading || !toggle) return;

    const mobileQuery = window.matchMedia('(max-width: 700px)');

    const setCollapsed = (collapsed: boolean) => {
      panel.classList.toggle('mobile-collapsed', collapsed);
      toggle.textContent = collapsed ? '⌃' : '⌄';
      toggle.setAttribute('aria-expanded', (!collapsed).toString());
    };

    const syncForViewport = () => {
      if (mobileQuery.matches) {
        if (!panel.classList.contains('mobile-collapsed')) setCollapsed(true);
      } else {
        panel.classList.remove('mobile-collapsed');
        toggle.setAttribute('aria-expanded', 'true');
      }
    };

    const handleToggle = (e: Event) => {
      if (!mobileQuery.matches) return;
      e.preventDefault();
      e.stopPropagation();
      setCollapsed(!panel.classList.contains('mobile-collapsed'));
    };

    heading.addEventListener('click', handleToggle);
    toggle.addEventListener('click', handleToggle);
    toggle.addEventListener('touchend', handleToggle);

    syncForViewport();
    mobileQuery.addEventListener('change', syncForViewport);
  }
}
