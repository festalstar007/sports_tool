import { Link } from 'react-router-dom';
import type { Activity } from '../../shared/activity-schema';
import { formatDateTime, formatDistance, formatDuration, formatPace } from '../../shared/units';

export function ActivityListItem({ activity }: { activity: Activity }) {
  return (
    <Link className="activity-list-item" to={`/activities/${activity.id}`}>
      <div className={`sport-badge ${activity.sportType}`} aria-hidden="true">
        {activity.sportType === 'running' ? '跑' : '走'}
      </div>
      <div className="activity-list-main">
        <div className="activity-list-title">
          <strong>{activity.sportType === 'running' ? '跑步' : '步行'}</strong>
          <time>{formatDateTime(activity.startedAt)}</time>
        </div>
        <div className="activity-list-metrics">
          <span>{formatDistance(activity.distanceMeters)}</span>
          <span>{formatDuration(activity.durationSeconds)}</span>
          <span>{formatPace(activity.avgPaceSecondsPerKm)} /km</span>
        </div>
      </div>
      <span className="chevron">›</span>
    </Link>
  );
}
