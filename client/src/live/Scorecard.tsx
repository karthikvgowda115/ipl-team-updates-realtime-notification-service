import { useEffect, useState } from 'react';
import { oversText, runRate, strikeRate, type Innings, type Match } from '../api/matches';
import TeamBadge from '../teams/TeamBadge';

const ballClass = (b: string) =>
  b === 'W' ? 'ball wicket' : b === '4' ? 'ball four' : b === '6' ? 'ball six' : b.startsWith('wd') || b.startsWith('nb') ? 'ball extra' : 'ball';
const ballText = (b: string) => (b === '0' ? '•' : b);

function StatusPill({ match }: { match: Match }) {
  if (match.status === 'live') return <span className="pill live">● LIVE</span>;
  if (match.status === 'innings_break') return <span className="pill break">Innings break</span>;
  if (match.status === 'abandoned') return <span className="pill done">Abandoned</span>;
  return <span className="pill done">Result</span>;
}

/** Header: both teams' scores, status and the chase equation. */
function ScoreHeader({ match }: { match: Match }) {
  const inningsOf = (short: string) => match.innings.find((i) => i.batting === short);
  const current = match.innings[match.currentInnings];
  const chasing = match.currentInnings === 1 && match.target !== null && match.status === 'live';
  const need = chasing ? match.target! - current.runs : 0;
  const ballsLeft = match.overs * 6 - (current?.balls ?? 0);

  return (
    <div className="score-header">
      <div className="score-meta">
        <StatusPill match={match} />
        <span className="muted small">
          {match.overs}-over match · {match.venue}
        </span>
      </div>

      <div className="score-teams">
        {match.teams.map((t) => {
          const inn = inningsOf(t.short);
          const batting = match.status === 'live' && current?.batting === t.short;
          return (
            <div key={t.short} className={`score-team${batting ? ' batting' : ''}${match.winner === t.short ? ' winner' : ''}`}>
              <TeamBadge short={t.short} size={44} />
              <div>
                <div className="team-name">{t.name}</div>
                {inn ? (
                  <div className="team-score">
                    <strong>
                      {inn.runs}/{inn.wickets}
                    </strong>{' '}
                    <span className="muted">({oversText(inn.balls)} ov)</span>
                  </div>
                ) : (
                  <div className="muted small">Yet to bat</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="score-line">
        {match.result ??
          (chasing
            ? `${current.batting} need ${need} run${need === 1 ? '' : 's'} from ${ballsLeft} ball${ballsLeft === 1 ? '' : 's'}`
            : match.status === 'innings_break'
              ? `${match.innings[0].bowling} need ${match.target} to win`
              : match.toss)}
      </p>
      {current && match.status === 'live' && (
        <p className="muted small rates">
          CRR {runRate(current.runs, current.balls)}
          {chasing && ballsLeft > 0 && <> · RRR {runRate(need, ballsLeft)}</>}
          {chasing && <> · Target {match.target}</>}
        </p>
      )}
    </div>
  );
}

/** Who's batting/bowling right now and the balls of this over. */
function AtTheCrease({ inn }: { inn: Innings }) {
  const bowler = inn.bowlers[inn.currentBowler];
  const pair = [inn.striker, inn.nonStriker].map((i) => ({ ...inn.batters[i], onStrike: i === inn.striker }));
  return (
    <div className="crease">
      <table className="mini-table">
        <thead>
          <tr>
            <th>Batter</th>
            <th>R</th>
            <th>B</th>
            <th>4s</th>
            <th>6s</th>
            <th>SR</th>
          </tr>
        </thead>
        <tbody>
          {pair
            .filter((b) => b.status === 'batting')
            .map((b) => (
              <tr key={b.name}>
                <td>
                  {b.name}
                  {b.onStrike && <span className="on-strike" title="On strike"> *</span>}
                </td>
                <td>
                  <strong>{b.runs}</strong>
                </td>
                <td>{b.balls}</td>
                <td>{b.fours}</td>
                <td>{b.sixes}</td>
                <td>{strikeRate(b.runs, b.balls)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {bowler && (
        <table className="mini-table">
          <thead>
            <tr>
              <th>Bowler</th>
              <th>O</th>
              <th>R</th>
              <th>W</th>
              <th>Econ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{bowler.name}</td>
              <td>{oversText(bowler.balls)}</td>
              <td>{bowler.runs}</td>
              <td>
                <strong>{bowler.wickets}</strong>
              </td>
              <td>{runRate(bowler.runs, bowler.balls)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="this-over" aria-label="This over">
        <span className="muted small">This over</span>
        {inn.thisOver.length === 0 ? (
          <span className="muted small">—</span>
        ) : (
          inn.thisOver.map((b, i) => (
            <span key={i} className={ballClass(b)}>
              {ballText(b)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

/** Full batting + bowling card for one innings. */
function InningsCard({ inn }: { inn: Innings }) {
  const yet = inn.batters.filter((b) => b.status === 'yet');
  return (
    <div className="innings-card">
      <table className="card-table">
        <thead>
          <tr>
            <th>Batter</th>
            <th></th>
            <th>R</th>
            <th>B</th>
            <th>4s</th>
            <th>6s</th>
            <th>SR</th>
          </tr>
        </thead>
        <tbody>
          {inn.batters
            .filter((b) => b.status !== 'yet')
            .map((b) => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td className="muted small">{b.status === 'out' ? b.dismissal : 'not out'}</td>
                <td>
                  <strong>{b.runs}</strong>
                </td>
                <td>{b.balls}</td>
                <td>{b.fours}</td>
                <td>{b.sixes}</td>
                <td>{strikeRate(b.runs, b.balls)}</td>
              </tr>
            ))}
          <tr className="subtotal">
            <td>Extras</td>
            <td></td>
            <td>{inn.extras}</td>
            <td colSpan={4}></td>
          </tr>
          <tr className="total">
            <td>Total</td>
            <td className="muted small">
              {oversText(inn.balls)} ov · RR {runRate(inn.runs, inn.balls)}
            </td>
            <td>
              <strong>
                {inn.runs}/{inn.wickets}
              </strong>
            </td>
            <td colSpan={4}></td>
          </tr>
        </tbody>
      </table>
      {yet.length > 0 && (
        <p className="muted small">
          <strong>Yet to bat:</strong> {yet.map((b) => b.name).join(', ')}
        </p>
      )}
      {inn.fallOfWickets.length > 0 && (
        <p className="muted small">
          <strong>Fall of wickets:</strong>{' '}
          {inn.fallOfWickets.map((f) => `${f.runs}-${f.wicket} (${f.batter}, ${f.over})`).join(' · ')}
        </p>
      )}

      <table className="card-table">
        <thead>
          <tr>
            <th>Bowler</th>
            <th>O</th>
            <th>R</th>
            <th>W</th>
            <th>Econ</th>
          </tr>
        </thead>
        <tbody>
          {inn.bowlers.map((b) => (
            <tr key={b.name}>
              <td>{b.name}</td>
              <td>{oversText(b.balls)}</td>
              <td>{b.runs}</td>
              <td>
                <strong>{b.wickets}</strong>
              </td>
              <td>{runRate(b.runs, b.balls)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Scorecard({ match }: { match: Match }) {
  const [tab, setTab] = useState(match.currentInnings);
  // Follow the action: switch to the 2nd innings tab when the chase begins.
  useEffect(() => setTab(match.currentInnings), [match.id, match.currentInnings]);

  const current = match.innings[match.currentInnings];
  const shownTab = Math.min(tab, match.innings.length - 1);

  return (
    <div className="scorecard">
      <section className="card">
        <ScoreHeader match={match} />
        {current && match.status === 'live' && <AtTheCrease inn={current} />}
      </section>

      <div className="score-columns">
        <section className="card">
          <div className="page-head">
            <h3>Scorecard</h3>
            <div className="segmented" role="tablist" aria-label="Innings">
              {match.innings.map((inn, i) => (
                <button
                  key={inn.batting}
                  type="button"
                  role="tab"
                  aria-selected={shownTab === i}
                  className={shownTab === i ? 'active' : ''}
                  onClick={() => setTab(i)}
                >
                  {inn.batting}
                </button>
              ))}
            </div>
          </div>
          {match.innings[shownTab] && <InningsCard inn={match.innings[shownTab]} />}
        </section>

        <section className="card">
          <h3>Commentary</h3>
          <ol className="commentary">
            {match.commentary.map((c, i) => (
              <li key={`${match.ballsBowled}-${i}`} className={`comm ${c.kind}`}>
                <span className="comm-over">{c.over}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
