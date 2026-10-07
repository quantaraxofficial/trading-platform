from django.urls import path
from . import views

urlpatterns = [
    path('sync/', views.sync_user, name='sync_user'),
    path('user/<str:uid>/', views.get_user_data, name='get_user_data'),
    path('templates/<str:uid>/', views.manage_templates, name='manage_templates'),
    path('templates/delete/<int:template_id>/', views.delete_template, name='delete_template'),
    path('pinescripts/<str:uid>/', views.manage_pinescripts, name='manage_pinescripts'),
    path('pinescripts/delete/<int:script_id>/', views.delete_pinescript, name='delete_pinescript'),
    path('drawings/<str:uid>/', views.manage_drawings, name='manage_drawings'),
    path('chart_state/<str:uid>/', views.manage_chart_state, name='manage_chart_state'),
    path('settings/<str:uid>/', views.manage_settings, name='manage_settings'),
    path('create-order/', views.create_cashfree_order, name='create_cashfree_order'),
    path('telemetry/session/start/<str:uid>/', views.start_backtest_session, name='start_backtest_session'),
    path('telemetry/actions/log/<str:uid>/', views.log_telemetry_actions, name='log_telemetry_actions'),
    path('bot/predict/', views.predict_bot_action, name='predict_bot_action'),
    path('agent/insights/<str:uid>/', views.get_agent_insights, name='get_agent_insights'),
    path('agent/strategy-note/<str:uid>/', views.submit_strategy_note, name='submit_strategy_note'),
]
