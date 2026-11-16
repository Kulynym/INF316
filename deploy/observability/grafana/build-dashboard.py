"""Generates dashboards/maxball.json, the MAXBALL application dashboard.

Run after editing: python3 deploy/observability/grafana/build-dashboard.py
Panels use the application metrics from src/server/telemetry/metrics.ts.
"""
import json
import pathlib

PROM = {"type": "prometheus", "uid": "prometheus"}
LOKI = {"type": "loki", "uid": "loki"}
ENV = 'environment=~"$environment"'
panels = []
y = 0


def row(title):
    global y
    panels.append({"type": "row", "title": title, "collapsed": False,
                   "gridPos": {"h": 1, "w": 24, "x": 0, "y": y}, "panels": []})
    y += 1


def panel(kind, title, targets, w, h, x, unit=None, description="", **extra):
    defaults = {"unit": unit} if unit else {}
    p = {
        "type": kind, "title": title, "description": description,
        "datasource": PROM, "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "targets": [{"datasource": PROM, "expr": expr, "legendFormat": legend, "refId": chr(65 + i)}
                    for i, (expr, legend) in enumerate(targets)],
        "fieldConfig": {"defaults": defaults, "overrides": []},
        "options": {},
    }
    p.update(extra)
    panels.append(p)
    return p


def stat(title, expr, x, unit=None, description="", thresholds=None, w=4):
    p = panel("stat", title, [(expr, "")], w, 4, x, unit, description)
    p["options"] = {"reduceOptions": {"calcs": ["lastNotNull"]}, "colorMode": "background", "graphMode": "area"}
    p["fieldConfig"]["defaults"]["thresholds"] = {"mode": "absolute", "steps": thresholds or [{"color": "blue", "value": None}]}
    return p


def series(title, targets, x, w=12, h=8, unit=None, description="", stack=False):
    p = panel("timeseries", title, targets, w, h, x, unit, description)
    p["fieldConfig"]["defaults"]["custom"] = {"drawStyle": "line", "lineWidth": 2, "fillOpacity": 15,
                                              "stacking": {"mode": "normal" if stack else "none"}}
    p["options"] = {"legend": {"displayMode": "list", "placement": "bottom"}, "tooltip": {"mode": "multi"}}
    return p


row("Overview")
stat("Site health", f'max(httpcheck_status{{http_status_class="2xx",{ENV}}})', 0,
     description="1 = /api/health answers 2xx (collector probe every 15s)",
     thresholds=[{"color": "red", "value": None}, {"color": "green", "value": 1}])
stat("Actions / min", f"sum(rate(maxball_actions_total{{{ENV}}}[5m])) * 60", 4, "short")
stat("Server error ratio", f'sum(rate(maxball_actions_total{{outcome="error",{ENV}}}[5m])) / clamp_min(sum(rate(maxball_actions_total{{{ENV}}}[5m])), 0.001)', 8, "percentunit",
     thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 0.01}, {"color": "red", "value": 0.05}])
stat("p95 action time", f"histogram_quantile(0.95, sum by (le) (rate(maxball_action_duration_seconds_bucket{{{ENV}}}[5m])))", 12, "s",
     thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 0.5}, {"color": "red", "value": 1}])
stat("Open issues", f'sum(maxball_feedback_open{{type="issue",{ENV}}})', 16, "short",
     description="Published problem reports not resolved yet")
stat("Posts today", f"sum(increase(maxball_feedback_created_total{{{ENV}}}[24h]))", 20, "short")
y += 4

row("Community activity")
series("Feedback published by type (per hour)",
       [(f"sum by (type) (rate(maxball_feedback_created_total{{{ENV}}}[15m])) * 3600", "{{type}}")], 0, unit="short", stack=True)
series("Open feedback by type and status",
       [(f"sum by (type, status) (maxball_feedback_open{{{ENV}}})", "{{type}} / {{status}}")], 12, unit="short")
y += 8
series("Engagement (per hour)", [
    (f"sum(rate(maxball_comments_created_total{{{ENV}}}[15m])) * 3600", "comments"),
    (f"sum(rate(maxball_supports_toggled_total{{{ENV}}}[15m])) * 3600", "support votes"),
    (f"sum(rate(maxball_teacher_ratings_total{{{ENV}}}[15m])) * 3600", "teacher ratings"),
    (f"sum(rate(maxball_registrations_total{{{ENV}}}[15m])) * 3600", "registrations"),
], 0, unit="short")
series("Moderation (per hour)", [
    (f"sum by (reason) (rate(maxball_reports_created_total{{{ENV}}}[15m])) * 3600", "report: {{reason}}"),
    (f"sum by (action) (rate(maxball_moderation_actions_total{{{ENV}}}[15m])) * 3600", "{{action}}"),
    (f"sum by (status) (rate(maxball_status_changes_total{{{ENV}}}[15m])) * 3600", "status → {{status}}"),
], 12, unit="short")
y += 8

row("Reliability")
series("Actions by outcome (per min)",
       [(f"sum by (outcome) (rate(maxball_actions_total{{{ENV}}}[5m])) * 60", "{{outcome}}")], 0, unit="short", stack=True)
series("Action time p50 / p95 by action",
       [(f"histogram_quantile(0.95, sum by (le, action) (rate(maxball_action_duration_seconds_bucket{{{ENV}}}[5m])))", "p95 {{action}}"),
        (f"histogram_quantile(0.5, sum by (le) (rate(maxball_action_duration_seconds_bucket{{{ENV}}}[5m])))", "p50 all")], 12, unit="s")
y += 8
series("Logins by result (per 5 min)",
       [(f"sum by (result) (increase(maxball_logins_total{{{ENV}}}[5m]))", "{{result}}")], 0, unit="short")
series("Rate limited requests by bucket (per 5 min)",
       [(f"sum by (bucket) (increase(maxball_rate_limited_total{{{ENV}}}[5m]))", "{{bucket}}")], 12, unit="short")
y += 8

row("Alerts and logs")
alerts = panel("alertlist", "Firing alerts (Prometheus rules → AI on-call agent)", [], 8, 10, 0)
alerts.pop("targets")
alerts["datasource"] = {"type": "alertmanager", "uid": "alertmanager"}
alerts["options"] = {"alertInstanceLabelFilter": "", "datasource": "Alertmanager", "groupMode": "default",
                     "maxItems": 20, "sortOrder": 1, "stateFilter": {"firing": True, "pending": True, "normal": False},
                     "viewMode": "list"}
logs = panel("logs", "Application logs (warnings and errors)", [], 16, 10, 8)
logs["datasource"] = LOKI
logs["targets"] = [{"datasource": LOKI, "refId": "A",
                    "expr": '{service_name="maxball"} | severity_text=~"WARN|ERROR"'}]
logs["options"] = {"showTime": True, "wrapLogMessage": True, "sortOrder": "Descending", "enableLogDetails": True}
y += 10

dashboard = {
    "uid": "maxball-app",
    "title": "MAXBALL application",
    "description": "Application-specific metrics collected with OpenTelemetry (traces in Jaeger, logs in Loki).",
    "tags": ["maxball", "opentelemetry"],
    "timezone": "browser",
    "schemaVersion": 41,
    "refresh": "30s",
    "time": {"from": "now-6h", "to": "now"},
    "templating": {"list": [{
        "name": "environment", "label": "Environment", "type": "query", "datasource": PROM,
        "query": {"query": "label_values(maxball_actions_total, environment)", "refId": "env"},
        "definition": "label_values(maxball_actions_total, environment)",
        "includeAll": True, "multi": True, "allValue": ".*",
        "current": {"text": "All", "value": "$__all"}, "refresh": 2,
    }]},
    "links": [{"title": "Traces (Jaeger)", "type": "link", "url": "/explore?left=%7B%22datasource%22:%22jaeger%22%7D", "targetBlank": True}],
    "panels": panels,
}
out = pathlib.Path(__file__).parent / "dashboards" / "maxball.json"
out.write_text(json.dumps(dashboard, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {out} with {len(panels)} panels")
