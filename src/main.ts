import './style.css';
import './DirectionalPad.css';
import './InteractionMenu.css';
import { initInputs } from './Interface/InteractionMenu';
import { initScaling } from './scaling';
import { initThree } from './three/threeLoader';

initInputs();
initThree();
initScaling();
