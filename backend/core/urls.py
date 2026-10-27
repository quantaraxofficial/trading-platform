from django.urls import path
from . import views, collab, collab_files

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
    path('track-failure/', views.track_failure, name='track_failure'),
    path('feedback/', views.submit_feedback, name='submit_feedback'),
    # Live data read endpoints (ClickHouse -> the site)
    path('live/last-prices/', views.get_last_prices, name='live_last_prices'),
    path('live/candles/', views.get_candles, name='live_candles'),
    # Collab charts (the live part is the WebSocket in consumers.py)
    path('collab/<str:uid>/rooms/', collab.collab_rooms, name='collab_rooms'),
    path('collab/<str:uid>/people/', collab.collab_people, name='collab_people'),
    path('collab/<str:uid>/room/<str:token>/', collab.collab_room, name='collab_room'),
    path('collab/<str:uid>/room/<str:token>/invite/', collab.collab_invite, name='collab_invite'),
    path('collab/<str:uid>/room/<str:token>/transfer/', collab.collab_transfer, name='collab_transfer'),
    path('collab/<str:uid>/room/<str:token>/member/<str:member_uid>/', collab.collab_member, name='collab_member'),
    path('collab/<str:uid>/room/<str:token>/members/', collab.collab_members, name='collab_members'),
    path('collab/<str:uid>/room/<str:token>/summary/', collab.collab_room_summary, name='collab_room_summary'),
    path('collab/<str:uid>/room/<str:token>/upload/', collab_files.collab_upload, name='collab_upload'),
    path('collab/<str:uid>/room/<str:token>/file/<int:message_id>/', collab_files.collab_file, name='collab_file'),
    path('collab/<str:uid>/room/<str:token>/request/', collab.collab_request, name='collab_request'),
    path('collab/<str:uid>/room/<str:token>/requests/<str:member_uid>/', collab.collab_request_answer, name='collab_request_answer'),
    path('collab/<str:uid>/room/<str:token>/kicked/<str:member_uid>/', collab.collab_unkick, name='collab_unkick'),
]
