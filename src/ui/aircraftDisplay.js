import { mobilePerformanceProfile } from '../mobileProfile.js';

/** Own the shared aircraft display preference and its controls. */
export class AircraftDisplay {
  constructor({ elements, readDataManager, layout, profile = null }) {
    this._profile = profile || mobilePerformanceProfile();
    Object.assign(this, elements, {
      readDataManager,
      _layoutRightPanels: layout,
    });
    // Both aircraft layers default to models enabled in proximity mode.
    this._models3dEnabled = true;
    this._models3dMode = 'proximity';
    this._models3dModeBtns = [
      document.getElementById('models3d-mode-proximity'),
      document.getElementById('models3d-mode-all'),
    ];
  }
  get _dataManager() {
    return this.readDataManager();
  }
  _setModels3dParams(params, { origin = 'user' } = {}) {
    this._dataManager?.setLayerParams('flights', params, { origin });
    this._dataManager?.setLayerParams('military', params, { origin });
  }

  _syncModels3dFromLayerState(state) {
    const options = state?.options?.flights;
    if (!options) return;
    this._models3dEnabled = options.models3d === true;
    this._models3dMode = options.models3dMode === 'all' ? 'all' : 'proximity';
    this._syncModels3dButtonState();
    this._models3dModeRow?.classList.toggle('visible', this._models3dEnabled);
    for (const button of this._models3dModeBtns || []) {
      if (!button) continue;
      const active = button.dataset.mode === this._models3dMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    this._layoutRightPanels();
  }

  _syncModels3dModeRow() {
    if (this._models3dModeRow)
      this._models3dModeRow.classList.toggle('visible', this._models3dEnabled);
    this._layoutRightPanels();
  }

  _initModels3dToggle() {
    if (!this._models3dBtn) return;
    this._syncModels3dButtonState();
    this._syncModels3dModeRow();
  }

  /**
   * Turn the glTF fleet off for a phone's FIRST load.
   *
   * The owner directive that makes models default-ON in proximity mode reasons
   * about a desktop GPU. On a phone the same scene is the difference between a
   * globe and a slideshow, so a narrow viewport starts with billboards only —
   * no contact disappears, only its model, and the DISPLAY toggle turns them
   * straight back on.
   *
   * Applied after layer state settles, never before: the coordinator pushes
   * durable state when restoration resolves and would overwrite an earlier
   * write. A share link that asks for models therefore still wins, and the
   * shared default in layerState.js is deliberately left alone because its
   * `absentValue` carries the v2 share-link schema's meaning.
   * @returns {boolean} whether the fleet was switched off by this call.
   */
  applyMobileModels3dDefault() {
    if (this._profile.aircraftModels3d !== false) return false;
    if (!this._models3dEnabled) return false;
    this._models3dEnabled = false;
    this._setModels3dParams({ models3d: false }, { origin: 'programmatic' });
    this._syncModels3dButtonState();
    this._syncModels3dModeRow();
    return true;
  }

  _setModels3dEnabled(enabled) {
    this._models3dEnabled = !!enabled;
    this._setModels3dParams({ models3d: this._models3dEnabled });
    this._syncModels3dButtonState();
  }

  _setModels3dMode(mode) {
    const normalized = mode === 'all' ? 'all' : 'proximity';
    this._models3dMode = normalized;
    this._setModels3dParams({ models3dMode: normalized });
    for (const button of this._models3dModeBtns) {
      if (!button) continue;
      const active = button.dataset.mode === normalized;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    this._syncModels3dButtonState();
  }

  _syncModels3dButtonState() {
    this._models3dBtn?.classList.toggle('active', this._models3dEnabled);
    // The lit/dark state is a colour to a sighted operator and nothing at all to
    // a screen reader without this. It matters more now that the button ships
    // ACTIVE from markup (default-on, 2026-08-22): the very first thing assistive
    // tech reported was an unpressed-looking control over an armed layer.
    // Mirrors #scope-toggle, which has always carried aria-pressed.
    this._models3dBtn?.setAttribute(
      'aria-pressed',
      String(this._models3dEnabled),
    );
  }
}
