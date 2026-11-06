import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import './style.css';

// Mode hors connexion : met en cache l'application et se met à jour automatiquement.
registerSW({ immediate: true });

render(<App />, document.getElementById('app')!);
