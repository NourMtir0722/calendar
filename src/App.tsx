import { AudioProvider } from './audio/AudioProvider';
import { StillLifeCalendar } from './components/StillLifeCalendar';

export function App() {
  return (
    <AudioProvider>
      <StillLifeCalendar />
    </AudioProvider>
  );
}
