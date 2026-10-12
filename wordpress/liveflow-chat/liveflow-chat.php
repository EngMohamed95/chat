<?php
/**
 * Plugin Name: LiveFlow Chat
 * Description: Adds the LiveFlow live chat bubble to the bottom corner of every page.
 * Version: 1.0.0
 * Author: LiveFlow
 * License: GPL-2.0-or-later
 * Text Domain: liveflow-chat
 */

if (!defined('ABSPATH')) {
    exit;
}

const LIVEFLOW_OPTION = 'liveflow_chat_options';

function liveflow_chat_options() {
    $defaults = array('server_url' => '', 'position' => '');
    return wp_parse_args(get_option(LIVEFLOW_OPTION, array()), $defaults);
}

// --- Front end: load widget.js on every public page ---------------------------

add_action('wp_footer', function () {
    $opts = liveflow_chat_options();
    $server = untrailingslashit($opts['server_url']);
    if ($server === '') {
        return;
    }
    $position = in_array($opts['position'], array('bottom-left', 'bottom-right'), true) ? $opts['position'] : '';
    printf(
        '<script src="%s" defer%s></script>' . "\n",
        esc_url($server . '/widget.js'),
        $position ? ' data-position="' . esc_attr($position) . '"' : ''
    );
});

// --- Settings page: Settings > LiveFlow Chat -----------------------------------

add_action('admin_init', function () {
    register_setting('liveflow_chat', LIVEFLOW_OPTION, array(
        'type' => 'array',
        'sanitize_callback' => function ($input) {
            $position = isset($input['position']) ? $input['position'] : '';
            return array(
                'server_url' => isset($input['server_url']) ? esc_url_raw(trim($input['server_url'])) : '',
                'position' => in_array($position, array('bottom-left', 'bottom-right'), true) ? $position : '',
            );
        },
    ));
});

add_action('admin_menu', function () {
    add_options_page('LiveFlow Chat', 'LiveFlow Chat', 'manage_options', 'liveflow-chat', 'liveflow_chat_settings_page');
});

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
    array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=liveflow-chat')) . '">Settings</a>');
    return $links;
});

function liveflow_chat_settings_page() {
    $opts = liveflow_chat_options();
    ?>
    <div class="wrap">
        <h1>LiveFlow Chat</h1>
        <form method="post" action="options.php">
            <?php settings_fields('liveflow_chat'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="liveflow-server">Chat server URL</label></th>
                    <td>
                        <input id="liveflow-server" type="url" class="regular-text" placeholder="https://chat.example.com"
                               name="<?php echo esc_attr(LIVEFLOW_OPTION); ?>[server_url]"
                               value="<?php echo esc_attr($opts['server_url']); ?>">
                        <p class="description">The address of your LiveFlow server (must be HTTPS if this site is HTTPS).</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Bubble position</th>
                    <td>
                        <?php
                        $choices = array(
                            '' => 'Use the dashboard setting',
                            'bottom-right' => 'Bottom right',
                            'bottom-left' => 'Bottom left',
                        );
                        foreach ($choices as $value => $label) {
                            printf(
                                '<label style="display:block;margin-bottom:6px"><input type="radio" name="%s[position]" value="%s"%s> %s</label>',
                                esc_attr(LIVEFLOW_OPTION),
                                esc_attr($value),
                                checked($opts['position'], $value, false),
                                esc_html($label)
                            );
                        }
                        ?>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}
